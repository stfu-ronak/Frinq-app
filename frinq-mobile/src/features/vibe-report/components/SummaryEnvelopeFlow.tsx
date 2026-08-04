import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { radius, spacing } from '../../../design/tokens/spacing';
import { fontFamily } from '../../../design/tokens/typography';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { SummaryCardStack, SummaryCard } from './SummaryCardStack';

/** Total sequence length; each beat below is expressed as an offset into it,
 *  mirroring the web original's keyframe fractions of its 3600ms timeline. */
const TOTAL_MS = 3600;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const EASE_SPRING = Easing.bezier(0.18, 0.72, 0.24, 1.02);

const at = (fraction: number) => Math.round(TOTAL_MS * fraction);

/** Envelope geometry: the four paper flaps all converge here (also where the
 *  wax seal sits). Percentages of the envelope box. */
const APEX_X = 50;
const APEX_Y = 52;
const ENVELOPE_ASPECT = 345 / 267;

/** Warm light blooming out of the envelope's neck as the flap lifts. */
function EnvelopeGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="envGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={color.summary.envelopeGlow} stopOpacity={0.95} />
          <Stop offset="0.24" stopColor={color.brand.peach} stopOpacity={0.52} />
          <Stop offset="0.51" stopColor={color.brand.maroon} stopOpacity={0.16} />
          <Stop offset="0.71" stopColor={color.brand.maroon} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d="M0 0 H100 V100 H0 Z" fill="url(#envGlow)" transform="scale(10)" />
    </Svg>
  );
}

/** One triangular paper flap, drawn as an SVG polygon so the fold creases are
 *  exact (React Native has no clip-path). Coordinates are in a 0-100 space. */
function Flap({ points, fill }: { points: string; fill: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polygon points={points} fill={fill} />
    </Svg>
  );
}

/** The wax seal — an 11-point star (Figma "Star 1"), maroon, with the frinq
 *  wordmark centered on it. */
function WaxSeal() {
  return (
    <View style={styles.sealInner}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 67 66" accessibilityElementsHidden importantForAccessibility="no">
        <Path
          d="M28.03 3.21C30.45-1.07 36.61-1.07 39.03 3.21L41.65 7.84C42.95 10.13 45.54 11.38 48.15 10.96L53.4 10.13C58.26 9.36 62.09 14.17 60.26 18.73L58.28 23.67C57.3 26.11 57.93 28.91 59.88 30.69L63.81 34.28C67.44 37.59 66.07 43.6 61.37 45.01L56.27 46.53C53.74 47.29 51.95 49.54 51.77 52.17L51.42 57.48C51.09 62.38 45.54 65.05 41.51 62.25L37.13 59.22C34.97 57.71 32.09 57.71 29.93 59.22L25.55 62.25C21.52 65.05 15.97 62.38 15.64 57.48L15.29 52.17C15.11 49.54 13.32 47.29 10.79 46.53L5.7 45.01C0.99 43.6-0.38 37.59 3.25 34.28L7.18 30.69C9.13 28.91 9.77 26.11 8.78 23.67L6.8 18.73C4.97 14.17 8.81 9.36 13.66 10.13L18.91 10.96C21.52 11.38 24.11 10.13 25.41 7.84L28.03 3.21Z"
          fill={color.summary.sealRed}
        />
      </Svg>
      <BrandHeading variant="display" style={styles.sealText}>frinq</BrandHeading>
    </View>
  );
}

type Props = {
  firstName: string;
  cards: SummaryCard[];
  /** Fires as the card clears the envelope, while the scene is still fading —
   *  the report mounts underneath so there's no blank frame between them. */
  onRevealStart: () => void;
  /** Fires when the sequence is fully finished and this scene can unmount. */
  onRevealComplete: () => void;
};

/**
 * The envelope-opening moment that precedes the written summary. Three
 * physical beats: the flap folds back, the deck rises halfway out of the
 * pocket, then pulls fully clear — followed by a cream wash that hands off to
 * the report underneath. Only transform/opacity animate throughout, so it
 * stays on the compositor.
 *
 * Ported from the web original (`SummaryEnvelopeFlow.tsx`), with two
 * necessary platform changes: CSS `clip-path` flaps become SVG polygons, and
 * the single multi-keyframe Web Animations timeline becomes per-beat
 * `withDelay(withTiming(...))` chains, since Reanimated has no keyframe-array
 * equivalent.
 */
export function SummaryEnvelopeFlow({ firstName, cards, onRevealStart, onRevealComplete }: Props) {
  const reduced = useReducedMotion();
  const [opening, setOpening] = useState(false);
  const [pocketOpen, setPocketOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fractions of the deck's own height, so "halfway out" and "fully clear"
  // read the same on a small phone and a large one.
  const deckHeight = useSharedValue(0);

  const intro = useSharedValue(1); // greeting + envelope prompt copy
  const sceneOpacity = useSharedValue(1);
  const sceneShift = useSharedValue(0);
  const glow = useSharedValue(0);
  const glowScale = useSharedValue(0.55);
  const flap = useSharedValue(0); // 0 = closed, 1 = folded fully back
  const deckY = useSharedValue(0);
  const deckOpacity = useSharedValue(0);
  const deckScale = useSharedValue(0.9);
  const seal = useSharedValue(1);
  const sealDrop = useSharedValue(0);
  const wash = useSharedValue(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const run = useCallback(() => {
    if (opening) return;
    setOpening(true);

    if (reduced) {
      // No spatial motion: hand straight off to the report.
      timers.current.push(setTimeout(onRevealStart, 20));
      timers.current.push(setTimeout(onRevealComplete, 180));
      return;
    }

    const halfPull = deckHeight.value * 0.42;
    const fullPull = deckHeight.value * 1.16;

    intro.value = withTiming(0, { duration: 300, easing: EASE_OUT });

    // Seal pops, then slides off as the flap starts to lift.
    seal.value = withDelay(at(0.1), withTiming(0, { duration: at(0.24), easing: EASE_OUT }));
    sealDrop.value = withDelay(at(0.1), withTiming(48, { duration: at(0.24), easing: EASE_OUT }));

    // Flap folds back over the top of the envelope.
    flap.value = withDelay(at(0.16), withTiming(1, { duration: at(0.27), easing: EASE_IN_OUT }));

    // Light grows from inside the envelope, then recedes as the card leaves.
    glow.value = withDelay(at(0.22), withTiming(1, { duration: at(0.39), easing: EASE_OUT }));
    glowScale.value = withDelay(at(0.22), withTiming(1.28, { duration: at(0.64), easing: EASE_OUT }));

    // Deck: fade in inside the pocket, rise halfway, pause, then pull clear.
    deckOpacity.value = withDelay(at(0.24), withTiming(1, { duration: at(0.09), easing: EASE_OUT }));
    deckScale.value = withDelay(at(0.33), withTiming(1, { duration: at(0.2), easing: EASE_SPRING }));
    deckY.value = withDelay(
      at(0.33),
      withTiming(-halfPull, { duration: at(0.2), easing: EASE_SPRING }, () => {
        deckY.value = withDelay(at(0.09), withTiming(-fullPull, { duration: at(0.2), easing: EASE_SPRING }));
      }),
    );

    // Envelope recedes only after the card has completely cleared it.
    sceneOpacity.value = withDelay(at(0.91), withTiming(0, { duration: at(0.09), easing: EASE_OUT }));
    sceneShift.value = withDelay(at(0.91), withTiming(20, { duration: at(0.09), easing: EASE_OUT }));
    glow.value = withDelay(at(0.86), withTiming(0, { duration: at(0.14), easing: EASE_OUT }));

    // Cream wash covers the hand-off to the report.
    wash.value = withDelay(at(0.91), withTiming(1, { duration: at(0.09), easing: EASE_OUT }));

    // The pocket mouth only appears once the flap is up — a sealed envelope
    // shouldn't show an opening.
    timers.current.push(setTimeout(() => setPocketOpen(true), 900));
    timers.current.push(setTimeout(onRevealStart, at(0.83)));
    timers.current.push(setTimeout(onRevealComplete, TOTAL_MS));
  }, [
    opening, reduced, onRevealStart, onRevealComplete, deckHeight,
    intro, sceneOpacity, sceneShift, glow, glowScale, flap,
    deckY, deckOpacity, deckScale, seal, sealDrop, wash,
  ]);

  const introStyle = useAnimatedStyle(() => ({ opacity: intro.value, transform: [{ translateY: (1 - intro.value) * -10 }] }));
  const sceneStyle = useAnimatedStyle(() => ({ opacity: sceneOpacity.value, transform: [{ translateY: sceneShift.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: glowScale.value }] }));
  const deckStyle = useAnimatedStyle(() => ({
    opacity: deckOpacity.value,
    transform: [{ translateY: deckY.value }, { scale: deckScale.value }],
  }));
  const sealStyle = useAnimatedStyle(() => ({ opacity: seal.value, transform: [{ translateY: sealDrop.value }] }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));
  // rotateX folds the flap's far edge AWAY from the viewer, back over the
  // envelope — the real opening direction. It also fades past the midpoint so
  // the (unshaded) reverse side never reads as a flat slab.
  const flapStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.max(0, flap.value - 0.5) * 2),
    transform: [{ perspective: 700 }, { rotateX: `${flap.value * 148}deg` }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.intro, introStyle]}>
        <BodyText style={styles.greeting}>Hi {firstName || 'friend'},</BodyText>
        <BrandHeading variant="display" tone="brand" style={styles.headline}>
          Frinq has read between your lines.
        </BrandHeading>
        <BodyText variant="intro" tone="secondary" style={styles.subcopy}>
          Open the envelope to see the friend you are when it really counts.
        </BodyText>
      </Animated.View>

      <Animated.View style={[styles.scene, sceneStyle]}>
        <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
          <EnvelopeGlow />
        </Animated.View>

        {/* Envelope interior — visible through the open mouth; the depth cue
            that makes the card read as being inside, not behind. */}
        <View style={styles.envelopeBack} />

        {/* The deck lives in a window that extends far above the envelope but
            stops at its bottom edge: the card can travel up and out, but can
            never appear below the envelope. */}
        <View style={styles.deckWindow} pointerEvents="none">
          <Animated.View
            style={[styles.deckHolder, deckStyle]}
            onLayout={(e) => { deckHeight.value = e.nativeEvent.layout.height; }}
          >
            <SummaryCardStack cards={cards} interactive={false} />
          </Animated.View>
        </View>

        {/* Front pocket — covers the deck, but only within the envelope's own
            bounds, exactly like real paper. */}
        <View style={styles.pocket} pointerEvents="none">
          <Flap
            points={pocketOpen ? `0,25 0,100 ${APEX_X},${APEX_Y}` : `0,0 0,100 ${APEX_X},${APEX_Y}`}
            fill={color.summary.envelopePaper}
          />
          <Flap
            points={pocketOpen ? `100,25 100,100 ${APEX_X},${APEX_Y}` : `100,0 100,100 ${APEX_X},${APEX_Y}`}
            fill={color.summary.envelopePaper}
          />
          <Flap points={`0,100 100,100 ${APEX_X},${APEX_Y}`} fill={color.summary.envelopePaperDeep} />
        </View>

        {/* Top flap — the one piece that moves, hinged on its own top edge. */}
        <Animated.View style={[styles.flapLayer, flapStyle]} pointerEvents="none">
          <Flap points={`0,0 100,0 ${APEX_X},${APEX_Y}`} fill={color.summary.envelopePaperLight} />
        </Animated.View>

        <Animated.View style={[styles.seal, sealStyle]} pointerEvents="none">
          <WaxSeal />
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your friend read"
          accessibilityState={{ disabled: opening }}
          disabled={opening}
          onPress={run}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.hint, introStyle]}>
        <BodyText variant="caption" tone="secondary" style={styles.hintText}>
          Tap the envelope to open your frinq summary
        </BodyText>
      </Animated.View>

      <Animated.View style={[styles.wash, washStyle]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg.canvas, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  intro: { alignItems: 'center', maxWidth: 320 },
  greeting: { fontFamily: fontFamily.bodyMedium, fontSize: 14, color: color.summary.sealRed },
  headline: { marginTop: spacing.md, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  subcopy: { marginTop: spacing.md, textAlign: 'center' },
  scene: { width: '100%', maxWidth: 346, aspectRatio: ENVELOPE_ASPECT, marginTop: spacing.xxxl },
  glow: { position: 'absolute', left: '-18%', top: '-18%', width: '136%', height: '136%', zIndex: 1 },
  envelopeBack: { ...StyleSheet.absoluteFill, zIndex: 0, borderRadius: radius.sm, backgroundColor: color.summary.envelopeBack, borderWidth: 1, borderColor: color.border.subtle },
  // Reaches far above the envelope, ends exactly at its bottom.
  deckWindow: { position: 'absolute', zIndex: 2, left: 0, right: 0, top: -720, bottom: 0, overflow: 'hidden' },
  deckHolder: { position: 'absolute', left: '11%', width: '78%', top: 720 + 42 },
  pocket: { ...StyleSheet.absoluteFill, zIndex: 3 },
  flapLayer: { ...StyleSheet.absoluteFill, zIndex: 5 },
  seal: { position: 'absolute', zIndex: 7, left: `${APEX_X}%`, top: `${APEX_Y}%`, width: '20%', aspectRatio: 1, marginLeft: '-10%', marginTop: '-10%' },
  sealInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sealText: { fontSize: 12, lineHeight: 16, color: color.brand.cream, paddingTop: 0, paddingBottom: 0 },
  hint: { marginTop: spacing.xl },
  hintText: { textAlign: 'center' },
  wash: { ...StyleSheet.absoluteFill, zIndex: 10, backgroundColor: color.bg.canvas },
});
