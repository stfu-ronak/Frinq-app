import React from 'react';
import { act, render } from '@testing-library/react-native';

// Capture the PanResponder config the deck builds, so the release handler can
// be driven with a synthetic gestureState. Driving the real panHandlers props
// is not viable: PanResponder ignores any gestureState passed in and derives
// dx from the responder system's own touch history, which a unit test has no
// way to populate. Capturing the config tests the deck's OWN swipe logic (the
// part that regressed) without reimplementing RN's gesture plumbing.
type PanConfig = {
  onMoveShouldSetPanResponder: (e: unknown, g: { dx: number; dy: number }) => boolean;
  onPanResponderRelease: (e: unknown, g: { dx: number; dy: number }) => void;
};
// `mock` prefix: jest hoists the factory above this declaration and only
// allows out-of-scope refs whose name starts with "mock".
let mockPanConfig: PanConfig | null = null;

// A Proxy, not an object spread: spreading react-native eagerly evaluates
// every lazy getter on its index (DevMenu, FlatList, ...), several of which
// call TurboModuleRegistry.getEnforcing and throw under Jest.
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'PanResponder') {
        return {
          create: (config: PanConfig) => {
            mockPanConfig = config;
            return { panHandlers: {} };
          },
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

// The global setup mock completes withTiming synchronously, which would make
// every exit finish instantly and hide the very race this file exists to
// cover. Override it here with a DEFERRED version: completion callbacks queue
// up and only run when the test flushes them, modelling a real in-flight
// 300ms exit animation.
const mockTimingCallbacks: Array<(finished: boolean) => void> = [];
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const identity = (v: unknown) => v;
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (C: unknown) => C },
    View,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: unknown, _config?: unknown, callback?: (f: boolean) => void) => {
      if (typeof callback === 'function') mockTimingCallbacks.push(callback);
      return value;
    },
    runOnJS: (fn: unknown) => fn,
    withDelay: (_d: unknown, value: unknown) => value,
    withSpring: identity,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    interpolateColor: (_v: unknown, _i: unknown, output: unknown[]) => output[output.length - 1],
    Easing: {
      bezier: () => identity,
      linear: identity,
      ease: identity,
      inOut: () => identity,
      in: () => identity,
      out: () => identity,
      quad: identity,
      cubic: identity,
    },
  };
});

/** Completes every animation currently in flight. */
function flushAnimations() {
  act(() => {
    const pending = mockTimingCallbacks.splice(0);
    pending.forEach((cb) => cb(true));
  });
}

import { SummaryCardStack, SummaryCard } from '../components/SummaryCardStack';

const CARDS: SummaryCard[] = [
  { key: 'a', label: 'you bring', text: 'card A text', shareCaption: 'A' },
  { key: 'b', label: 'you notice', text: 'card B text', shareCaption: 'B' },
  { key: 'c', label: 'you connect', text: 'card C text', shareCaption: 'C' },
  { key: 'd', label: 'you care', text: 'card D text', shareCaption: 'D' },
];

/** Only the TOP card renders the heart/share actions, and their labels carry
 *  the card's own label verbatim — a reliable read of which card is on top,
 *  unaffected by the title-casing applied to the body text. */
function topCardLabel(tree: ReturnType<typeof render>): string | null {
  for (const card of CARDS) {
    if (tree.queryByLabelText(`Share this card: ${card.label}`)) return card.label;
  }
  return null;
}

/** One complete swipe: release past threshold, then let the exit finish. */
function swipeLeft(dx = -200) {
  act(() => {
    mockPanConfig?.onPanResponderRelease({}, { dx, dy: 0 });
  });
  flushAnimations();
}

beforeEach(() => {
  mockPanConfig = null;
  mockTimingCallbacks.length = 0;
});

describe('SummaryCardStack', () => {
  it('starts on the first card', () => {
    const tree = render(<SummaryCardStack cards={CARDS} />);
    expect(topCardLabel(tree)).toBe('you bring');
  });

  it('advances exactly one card per swipe', () => {
    const tree = render(<SummaryCardStack cards={CARDS} />);
    swipeLeft();
    expect(topCardLabel(tree)).toBe('you notice');
  });

  it('does not skip a card when a second swipe lands during the exit animation — regression: two swipes inside the 300ms exit window each queued their own commit, so `active` jumped by 2 and a quick-read card was never shown', () => {
    const tree = render(<SummaryCardStack cards={CARDS} />);
    const config = mockPanConfig;
    // Two releases with NO flush in between: the first exit is still in
    // flight when the second lands — exactly the fast double-swipe case.
    act(() => {
      config?.onPanResponderRelease({}, { dx: -200, dy: 0 });
      config?.onPanResponderRelease({}, { dx: -200, dy: 0 });
    });
    flushAnimations();
    expect(topCardLabel(tree)).toBe('you notice');
  });

  it('accepts the next swipe once the previous exit has finished', () => {
    const tree = render(<SummaryCardStack cards={CARDS} />);
    swipeLeft();
    swipeLeft();
    expect(topCardLabel(tree)).toBe('you connect');
  });

  it('a below-threshold drag does not advance', () => {
    const tree = render(<SummaryCardStack cards={CARDS} />);
    swipeLeft(-10);
    expect(topCardLabel(tree)).toBe('you bring');
  });

  it('loops back to the first card after the last, so a swiped card can be reached again', () => {
    // The deck used to dead-end on the final card: there is no prev/back
    // control, so one accidental swipe put a quick-read permanently out of
    // reach. Cycling is the only way back to it.
    const tree = render(<SummaryCardStack cards={CARDS} />);
    swipeLeft();
    swipeLeft();
    swipeLeft();
    expect(topCardLabel(tree)).toBe('you care'); // last card
    swipeLeft();
    expect(topCardLabel(tree)).toBe('you bring'); // wrapped around
  });

  it('keeps the deck stacked behind the last card rather than leaving it floating alone', () => {
    // depth is computed modulo the deck size — a raw `i - active` goes
    // negative once the last card is on top and hides every card behind it.
    const tree = render(<SummaryCardStack cards={CARDS} />);
    swipeLeft();
    swipeLeft();
    swipeLeft();
    // The wrapped-around first card must still be mounted as a depth card.
    expect(tree.queryByText('Card A text')).toBeTruthy();
  });

  it('a single-card deck springs back instead of cycling to itself', () => {
    const tree = render(<SummaryCardStack cards={[CARDS[0]]} />);
    swipeLeft();
    expect(topCardLabel(tree)).toBe('you bring');
  });

  it('refuses to start a new drag while a card is still exiting', () => {
    render(<SummaryCardStack cards={CARDS} />);
    const config = mockPanConfig!;
    expect(config.onMoveShouldSetPanResponder({}, { dx: -20, dy: 0 })).toBe(true);
    act(() => {
      config.onPanResponderRelease({}, { dx: -200, dy: 0 });
    });
    // Exit still in flight (not flushed) — the deck must not hand the card
    // over to a fresh drag that would fight the animation for translateX.
    expect(config.onMoveShouldSetPanResponder({}, { dx: -20, dy: 0 })).toBe(false);
    flushAnimations();
    expect(mockPanConfig!.onMoveShouldSetPanResponder({}, { dx: -20, dy: 0 })).toBe(true);
  });
});
