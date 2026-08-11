import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
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

/** The card's own radial sheen (Figma "summary-card-top-pattern"): a soft
 *  warm highlight off the top-left corner over the maroon gradient body. */
function CardSheen() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 367 390" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="cardSheen" cx="0.12" cy="0.06" r="0.62">
          <Stop offset="0" stopColor={color.summary.sheen} stopOpacity={0.07} />
          <Stop offset="1" stopColor={color.summary.sheen} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={367} height={390} fill="url(#cardSheen)" />
    </Svg>
  );
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

/** Thin wavy rules just inside all four edges of the lead card, mirrored, in a
 *  slightly lighter red than the card body — the design's engraved-stationery
 *  border. Deliberately low-contrast: it frames the type, never competes with
 *  it. Only the first card gets this (the quick-read cards are plain). */
function CardWaves() {
  const wave = (len: number) => {
    const step = len / 12;
    let d = 'M0,0';
    for (let i = 0; i < 12; i++) {
      d += ` q${step / 4},-3 ${step / 2},0 t${step / 2},0`;
    }
    return d;
  };
  const H = wave(100);
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G stroke={color.summary.cardWave} strokeWidth={0.5} fill="none">
        <Path d={H} transform="translate(0,6)" />
        <Path d={H} transform="translate(0,9)" />
        <Path d={H} transform="translate(0,94) scale(1,-1)" />
        <Path d={H} transform="translate(0,91) scale(1,-1)" />
        <Path d={H} transform="rotate(90) translate(0,-6)" />
        <Path d={H} transform="rotate(90) translate(0,-9)" />
        <Path d={H} transform="rotate(-90) translate(-100,94)" />
        <Path d={H} transform="rotate(-90) translate(-100,91)" />
      </G>
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
 *  in sync. */
function CardFace({
  card, isTop, isFirst, interactive, onShare,
}: {
  card: SummaryCard;
  isTop: boolean;
  /** The lead "your type" card — the only one with the engraved wave border. */
  isFirst: boolean;
  interactive: boolean;
  onShare: (ref: React.RefObject<ViewShotRef | null>, card: SummaryCard) => void;
}) {
  const shotRef = useRef<ViewShotRef>(null);
  const [saved, setSaved] = useState(false);
  return (
    <View style={styles.faceFill}>
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={styles.faceFill}>
        <View style={styles.faceBody}>
          <CardSheen />
          {isFirst && <CardWaves />}
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
function DepthCard({ card, depth, isFirst }: { card: SummaryCard; depth: number; isFirst: boolean }) {
  const d = useSharedValue(depth);
  useEffect(() => {
    d.value = withTiming(depth, { duration: SETTLE_MS, easing: DECK_EASING });
  }, [depth, d]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: d.value * 9 }, { scale: 1 - d.value * 0.038 }],
    opacity: Math.max(0, 0.62 - d.value * 0.27),
  }));
  return (
    <Animated.View style={[styles.card, { zIndex: 10 - depth }, style]} pointerEvents="none">
      <CardFace card={card} isTop={false} isFirst={isFirst} interactive={false} onShare={() => {}} />
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
  const isLast = active >= cards.length - 1;

  const commitAdvance = useCallback(() => {
    setActive((i) => Math.min(cards.length - 1, i + 1));
    translateX.value = 0;
    topOpacity.value = 1;
  }, [cards.length, translateX, topOpacity]);

  const advance = useCallback(
    (direction: -1 | 1) => {
      if (isLast) {
        translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING });
        return;
      }
      if (reduced) {
        commitAdvance();
        return;
      }
      translateX.value = withTiming(direction * screenWidth * 1.2, { duration: EXIT_MS, easing: DECK_EASING });
      topOpacity.value = withTiming(0, { duration: 240, easing: DECK_EASING });
      setTimeout(commitAdvance, EXIT_MS);
    },
    [isLast, reduced, screenWidth, translateX, topOpacity, commitAdvance],
  );

  const goBack = useCallback(() => {
    if (active === 0) return;
    setActive((i) => Math.max(0, i - 1));
    if (reduced) return;
    translateX.value = -screenWidth * 0.25;
    topOpacity.value = 0;
    translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING });
    topOpacity.value = withTiming(1, { duration: 260, easing: DECK_EASING });
  }, [active, reduced, screenWidth, translateX, topOpacity]);

  // PanResponder, not react-native-gesture-handler's Gesture API: this is a
  // single straightforward horizontal drag, and PanResponder is core React
  // Native — no separate native-module wiring/testing surface to prove out
  // for what's otherwise a one-axis swipe.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => interactive && !isLast && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_, gesture) => { translateX.value = gesture.dx; },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
            advance(gesture.dx < 0 ? -1 : 1);
          } else {
            translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING });
          }
        },
        onPanResponderTerminate: () => { translateX.value = withTiming(0, { duration: SETTLE_MS, easing: DECK_EASING }); },
      }),
    [interactive, isLast, translateX, advance],
  );

  const topCardStyle = useAnimatedStyle(() => ({
    opacity: topOpacity.value,
    transform: [{ translateX: translateX.value }, { rotateZ: `${translateX.value * 0.03}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {cards.map((card, i) => {
          const depth = i - active;
          if (depth < 0 || depth > 2) return null;
          const isTop = depth === 0;
          if (isTop) {
            return (
              <Animated.View key={card.key} style={[styles.card, styles.cardTop, topCardStyle]} {...panResponder.panHandlers}>
                <CardFace card={card} isTop isFirst={i === 0} interactive={interactive} onShare={onShare ?? (() => {})} />
              </Animated.View>
            );
          }
          return <DepthCard key={card.key} card={card} depth={depth} isFirst={i === 0} />;
        })}
      </View>

      {interactive && (
        <View style={styles.controls}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Previous card"
            accessibilityState={{ disabled: active === 0 }}
            disabled={active === 0}
            haptic={false}
            onPress={goBack}
            style={[styles.navButton, active === 0 && styles.navDisabled]}
          >
            <BodyText style={styles.navGlyph}>‹</BodyText>
          </PressableScale>
          <View style={styles.dots}>
            {cards.map((card, i) => (
              <View key={card.key} style={[styles.dot, i === active && styles.dotActive]} />
            ))}
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Next card"
            accessibilityState={{ disabled: isLast }}
            disabled={isLast}
            haptic={false}
            onPress={() => advance(-1)}
            style={[styles.navButton, isLast && styles.navDisabled]}
          >
            <BodyText style={styles.navGlyph}>›</BodyText>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  stage: { width: '100%', aspectRatio: CARD_ASPECT },
  card: { ...StyleSheet.absoluteFill, borderRadius: radius.xl },
  cardTop: { zIndex: 10 },
  faceFill: { flex: 1 },
  faceBody: { flex: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: color.summary.cardBg },
  // Web: 26px 24px 22px.
  faceContent: { paddingHorizontal: spacing.xl, paddingTop: 26, paddingBottom: 22 },
  cardLabel: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 18, letterSpacing: 0.3, color: color.summary.cardLabel },
  // lineHeight 34 on a 30px face left the descenders tight and the title
  // reading as a cramped slab; the web runs 1.1 on a serif that can take it.
  cardTitle: { marginTop: spacing.md, fontSize: 30, lineHeight: 38, letterSpacing: -0.5, color: color.brand.cream },
  cardText: { marginTop: spacing.md, fontFamily: fontFamily.bodyLight, fontSize: 17, lineHeight: 26, color: color.brand.cream },
  // No title above it (the quick-read cards), so the body gets more headroom.
  cardTextRoomy: { marginTop: spacing.lg, fontFamily: fontFamily.bodyLight, fontSize: 17, lineHeight: 26, color: color.brand.cream },
  // Bottom-left pair, ~18px apart (design). Was a single share button.
  cardActions: { position: 'absolute', left: spacing.md, bottom: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  cardAction: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.lg },
  navButton: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border.pill, alignItems: 'center', justifyContent: 'center' },
  navDisabled: { opacity: 0.3 },
  navGlyph: { fontSize: 20, lineHeight: 24, color: color.brand.maroon },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.summary.dotIdle },
  dotActive: { width: 16, backgroundColor: color.brand.maroon },
});
