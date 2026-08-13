import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { fontFamily } from '../../../design/tokens/typography';

/** One face of the deck. `title` is only set on the lead "your type" card;
 *  the quick-read cards are label + body only. */
export type SummaryCard = {
  key: string;
  label: string;
  title?: string;
  text: string;
  shareCaption: string;
};

const SWIPE_THRESHOLD = 80;
const EXIT_MS = 300;
const SETTLE_MS = 340;
const DECK_EASING = Easing.bezier(0.22, 1, 0.36, 1);
/** Figma card face: 367x440. */
const CARD_ASPECT = 367 / 440;

function capitalize(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** The web card sets `text-transform: capitalize` on the label and title, so
 *  "your type" / "the initiator" render as "Your Type" / "The Initiator".
 *  React Native has textTransform but not the per-word 'capitalize' behaviour
 *  consistently across platforms, so do it in JS and keep the two identical. */
function titleCase(text: string): string {
  return text.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Outline heart, paired with share along the card's bottom edge (design:
 *  two thin-stroke pale-peach icons, ~16px, ~18px apart). */
function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.65 12 20 12 20z"
        stroke={color.summary.cardLabel}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color.summary.cardLabel : 'none'}
      />
    </Svg>
  );
}

function ShareGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M8 7C8 7 10.1958 4.28386 11.4044 3.23889C11.5987 3.0709 11.8169 2.99152 12.0337 3.00072C12.2282 3.00897 12.4215 3.08844 12.5958 3.23912C13.8041 4.28428 16 7 16 7M12.0337 4V15"
        stroke={color.summary.cardLabel}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M8 11C6.59987 11 5.8998 11 5.36502 11.2725C4.89462 11.5122 4.51217 11.8946 4.27248 12.365C4 12.8998 4 13.5999 4 15V16C4 18.357 4 19.5355 4.73223 20.2678C5.46447 21 6.64298 21 9 21H15C17.357 21 18.5355 21 19.2678 20.2678C20 19.5355 20 18.357 20 16V15C20 13.5999 20 12.8998 19.7275 12.365C19.4878 11.8946 19.1054 11.5122 18.635 11.2725C18.1002 11 17.4001 11 16 11"
        stroke={color.summary.cardLabel}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** The maroon card body. Wrapped in ViewShot so the visible card itself is
 *  what gets captured for sharing — no separate off-screen duplicate to keep
 *  in sync. Flat, solid fill — no gradient/sheen/pattern overlay: just the
 *  text and its two icons. */
function CardFace({
  card, isTop, depth, interactive, onShare,
}: {
  card: SummaryCard;
  isTop: boolean;
  /** Picks the flat shade: 0 (front, lightest) through 3 (furthest back,
   *  darkest). Never a gradient on the card itself, just a different solid
   *  color per depth. */
  depth: number;
  interactive: boolean;
  onShare: (ref: React.RefObject<ViewShotRef | null>, card: SummaryCard) => void;
}) {
  const shotRef = useRef<ViewShotRef>(null);
  const [saved, setSaved] = useState(false);
  const shade = color.summary.cardShades[Math.min(depth, color.summary.cardShades.length - 1)];
  return (
    <View style={styles.faceFill}>
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={styles.faceFill}>
        <View style={[styles.faceBody, { backgroundColor: shade }]}>
          <View style={styles.faceContent}>
            <BodyText style={styles.cardLabel}>{titleCase(card.label)}</BodyText>
            {!!card.title && <BrandHeading variant="title" style={styles.cardTitle}>{titleCase(card.title)}</BrandHeading>}
            <BodyText style={card.title ? styles.cardText : styles.cardTextRoomy}>{capitalize(card.text)}</BodyText>
          </View>
        </View>
      </ViewShot>
      {isTop && interactive && (
        <View style={styles.cardActions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Save this card: ${card.label}`}
            onPress={() => setSaved((v) => !v)}
            style={styles.cardAction}
          >
            <HeartGlyph filled={saved} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Share this card: ${card.label}`}
            onPress={() => onShare(shotRef, card)}
            style={styles.cardAction}
          >
            <ShareGlyph />
          </PressableScale>
        </View>
      )}
    </View>
  );
}

type Props = {
  cards: SummaryCard[];
  /** False while the deck is still animating out of the envelope — the cards
   *  render but can't be swiped or shared yet. */
  interactive?: boolean;
  onShare?: (ref: React.RefObject<ViewShotRef | null>, card: SummaryCard) => void;
};

/** A card sitting behind the top one. Its depth CHANGES as the deck advances,
 *  and easing between depths is what makes the stack settle rather than snap —
 *  these used to be plain Views whose transform/opacity were recomputed on
 *  render, so every card behind the top one jumped a step instantly while the
 *  top card slid smoothly. Values match the web's depth*9 / 1-depth*0.038 /
 *  0.62-depth*0.27. */
function DepthCard({ card, depth }: { card: SummaryCard; depth: number }) {
  const d = useSharedValue(depth);
  useEffect(() => {
    d.value = withTiming(depth, { duration: SETTLE_MS, easing: DECK_EASING });
  }, [depth, d]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: d.value * -20 }, { scale: 1 - d.value * 0.035 }],
    // Fully opaque. The depth cards used to fade (0.7 down to 0.16), which
    // let the page bleed through and made the stack look washed out — depth
    // is already carried by the translateY offset, the scale step, and each
    // card's own darker shade from cardShades. Opacity was a fourth cue that
    // only cost solidity.
    opacity: 1,
  }));
  return (
    <Animated.View style={[styles.card, { zIndex: 10 - depth }, style]} pointerEvents="none">
      <CardFace card={card} isTop={false} depth={depth} interactive={false} onShare={() => {}} />
    </Animated.View>
  );
}

/** Swipeable deck of summary cards. The top card can be dragged sideways (or
 *  tapped) to advance; the cards behind it sit slightly lower and smaller as
 *  depth cues, and fade out once the last card is reached (there's genuinely
 *  nothing behind it then). Mirrors the web original's three-layer stack, but
 *  the depth cards here are the real card components rather than separate
 *  decorative pattern images. */
export function SummaryCardStack({ cards, interactive = true, onShare }: Props) {
  const reduced = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const translateX = useSharedValue(0);
  // The leaving card fades as it slides (web: opacity 240ms alongside the
  // 300ms slide). Without it the card stayed fully opaque until it was cut
  // off screen, which is most of why the change read as a jump.
  const topOpacity = useSharedValue(1);
  // True from the moment an exit animation starts until it has committed.
  // `active` (and therefore `isLast`) doesn't update until the commit lands,
  // so without this a second swipe inside the ~300ms exit window re-entered
  // advance() on the SAME card: it overwrote the in-flight animation but
  // still queued a second commit, and each commit incremented `active`
  // independently — two swipes, two increments, only one card seen leaving.
  // A quick-read card silently vanished from the deck.
  const exiting = useRef(false);

  // Wraps back to the first card instead of stopping at the last. The deck
  // had no way back once swiped through — the final card was a dead end with
  // no prev control, so an accidental swipe lost a quick-read permanently.
  const commitAdvance = useCallback(() => {
    exiting.current = false;
    setActive((i) => (i + 1) % cards.length);
    translateX.value = 0;
    topOpacity.value = 1;
  }, [cards.length, translateX, topOpacity]);

  const advance = useCallback(
    (direction: -1 | 1) => {
      // Mid-exit: leave the in-flight animation strictly alone. Snapping
      // translateX back to 0 here would yank the departing card back on
      // screen before its commit lands.
      if (exiting.current) return;
      // A single-card deck has nothing to cycle to — spring back instead of
      // animating a card out and straight back in.
      if (cards.length < 2) {
        translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING });
        return;
      }
      if (reduced) {
        commitAdvance();
        return;
      }
      exiting.current = true;
      topOpacity.value = withTiming(0, { duration: 240, easing: DECK_EASING });
      // Commit from the animation's OWN completion callback rather than a
      // parallel setTimeout — one source of truth for "the exit finished",
      // and nothing left running after unmount. `finished` guards the case
      // where the animation is interrupted rather than completed.
      translateX.value = withTiming(
        direction * screenWidth * 1.2,
        { duration: EXIT_MS, easing: DECK_EASING },
        (finished) => {
          if (finished) runOnJS(commitAdvance)();
        },
      );
    },
    [cards.length, reduced, screenWidth, translateX, topOpacity, commitAdvance],
  );

  // PanResponder, not react-native-gesture-handler's Gesture API: this is a
  // single straightforward horizontal drag, and PanResponder is core React
  // Native — no separate native-module wiring/testing surface to prove out
  // for what's otherwise a one-axis swipe.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // `!exiting.current` keeps a new drag from grabbing the card while
        // the previous one is still animating out — the drag would fight the
        // exit animation for translateX and leave the deck mid-flight.
        onMoveShouldSetPanResponder: (_, gesture) => interactive && cards.length > 1 && !exiting.current && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_, gesture) => { if (!exiting.current) translateX.value = gesture.dx; },
        onPanResponderRelease: (_, gesture) => {
          if (exiting.current) return;
          if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
            advance(gesture.dx < 0 ? -1 : 1);
          } else {
            translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING });
          }
        },
        onPanResponderTerminate: () => { if (!exiting.current) translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING }); },
      }),
    [interactive, cards.length, translateX, advance],
  );

  const topCardStyle = useAnimatedStyle(() => ({
    opacity: topOpacity.value,
    transform: [{ translateX: translateX.value }, { rotateZ: `${translateX.value * 0.03}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {cards.map((card, i) => {
          // Modulo, not a plain subtraction: the deck cycles, so once the
          // last card is on top the earlier ones must stack up BEHIND it
          // again (a raw `i - active` goes negative and hides them, leaving
          // the final card floating alone with no deck under it).
          const depth = (i - active + cards.length) % cards.length;
          if (depth > 3) return null;
          const isTop = depth === 0;
          if (isTop) {
            return (
              <Animated.View key={card.key} style={[styles.card, styles.cardTop, topCardStyle]} {...panResponder.panHandlers}>
                <CardFace card={card} isTop depth={0} interactive={interactive} onShare={onShare ?? (() => {})} />
              </Animated.View>
            );
          }
          return <DepthCard key={card.key} card={card} depth={depth} />;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  stage: { width: '100%', aspectRatio: CARD_ASPECT },
  card: { ...StyleSheet.absoluteFill, borderRadius: radius.xl },
  cardTop: { zIndex: 10 },
  faceFill: { flex: 1 },
  faceBody: { flex: 1, borderRadius: radius.xl, overflow: 'hidden' },
  // Web: 26px 24px 22px.
  faceContent: { paddingHorizontal: spacing.xl, paddingTop: 26, paddingBottom: 22 },
  cardLabel: { fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20, letterSpacing: 0.3, color: color.summary.cardLabel },
  // lineHeight 34 on a 30px face left the descenders tight and the title
  // reading as a cramped slab; the web runs 1.1 on a serif that can take it.
  cardTitle: { marginTop: spacing.md, fontSize: 28, lineHeight: 36, letterSpacing: -0.5, color: color.brand.cream },
  cardText: { marginTop: spacing.md, fontFamily: fontFamily.bodyLight, fontSize: 17, lineHeight: 25, color: color.brand.cream },
  // No title above it (the quick-read cards), so the body gets more headroom.
  cardTextRoomy: { marginTop: spacing.lg, fontFamily: fontFamily.bodyLight, fontSize: 17, lineHeight: 25, color: color.brand.cream },
  // Bottom-left pair, ~18px apart (design). Was a single share button.
  cardActions: { position: 'absolute', left: spacing.md, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  cardAction: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
});
