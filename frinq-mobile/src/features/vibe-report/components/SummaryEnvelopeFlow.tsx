import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { radius, spacing } from '../../../design/tokens/spacing';
import { fontFamily } from '../../../design/tokens/typography';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { SummaryHeroCard } from './SummaryHeroCard';

/** Total sequence length; each beat below is expressed as an offset into it,
 *  mirroring the web original's keyframe fractions of its 3600ms timeline. */
const TOTAL_MS = 3600;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const EASE_SPRING = Easing.bezier(0.18, 0.72, 0.24, 1.02);

/** Fraction of the reveal's total duration, in ms.
 *
 *  Marked as a worklet because it is called from BOTH runtimes: most uses are
 *  on the JS thread while scheduling, but the deck's second pull schedules
 *  itself from inside a withTiming completion callback, which reanimated runs
 *  on the UI runtime. Without the directive that call crashed the whole
 *  reveal with `[Worklets] Tried to synchronously call a Remote Function.
 *  Called "at" on the UI Runtime.` */
const at = (fraction: number) => {
  'worklet';
  return Math.round(TOTAL_MS * fraction);
};

/** Envelope geometry: the four paper flaps all converge here (also where the
 *  wax seal sits). Percentages of the envelope box. */
const APEX_X = 50;
const APEX_Y = 52;
const ENVELOPE_ASPECT = 345 / 267;
/** The deck's inset from the top of the envelope scene (web: top 16%). */
const DECK_TOP_FRACTION = 0.16;
/** Card width as a fraction of the envelope. Slightly narrower than the
 *  envelope, like a real letter inside its sleeve. Read together with the
 *  centring at the call site — size and offset must always change as a pair,
 *  or the card drifts off the envelope's middle. */
const CARD_W_FRACTION = 0.86;
/** Gap between the intro copy and the envelope, closed as it opens. */
const SCENE_GAP = 48;
/** Web uses 150vmax for the wash circle. */
const WASH_SIZE = Math.max(Dimensions.get('window').width, Dimensions.get('window').height) * 1.5;

/** Warm light blooming out of the envelope's neck as the flap lifts. */
function EnvelopeGlow() {
  return (
    // viewBox + userSpaceOnUse, NOT objectBoundingBox on an unscaled path: the
    // old version painted a 1000x1000 path inside a viewport only a few
    // hundred points wide, so the gradient's centre sat far off-box and only
    // its top-left quadrant was visible — the bright wedge that hung off the
    // bottom-right of the envelope. Here the circle is centred in the box and
    // is fully transparent well before the corners.
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="envGlow" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color.summary.envelopeGlow} stopOpacity={0.95} />
          <Stop offset="0.24" stopColor={color.brand.peach} stopOpacity={0.52} />
          <Stop offset="0.51" stopColor={color.brand.maroon} stopOpacity={0.16} />
          <Stop offset="0.71" stopColor={color.brand.maroon} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill="url(#envGlow)" />
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
  typeName: string;
  typeDefinition: string;
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
export function SummaryEnvelopeFlow({ firstName, typeName, typeDefinition, onRevealStart, onRevealComplete }: Props) {
  const reduced = useReducedMotion();
  const [opening, setOpening] = useState(false);
  const [pocketOpen, setPocketOpen] = useState(false);
  // The folded flap drops behind the envelope once it's past vertical, so it
  // can't sit on top of the card being pulled out (web does the same via a
  // zIndex flip at 1020ms).
  const [flapBehind, setFlapBehind] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fractions of the deck's own height, so "halfway out" and "fully clear"
  // read the same on a small phone and a large one.
  const deckHeight = useSharedValue(0);
  const sceneHeight = useSharedValue(0);
  // Plain state, not a shared value: only used to compute deckHolder's own
  // explicit width/left below, never read from a worklet. deckHolder's
  // width:'78%'/left:'11%' resolved against the wrong box once it became an
  // Animated.View (deckStyle) — the same class of bug as the hero card's
  // percentage width elsewhere in this screen, here making the card come out
  // measurably too far right and clipped against the envelope's own edge.
  const [sceneWidth, setSceneWidth] = useState(0);
  // Measured, because the flap's hinge maths needs its real pixel height.
  const flapHeight = useSharedValue(0);

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
  const sealScale = useSharedValue(1);
  const sceneLift = useSharedValue(0);
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

    // Same derivation as the web original: the card's travel is measured off
    // the DECK's height plus the deck's own inset from the top of the scene,
    // so "half out" and "fully clear" mean the same thing on any screen.
    const deckTop = sceneHeight.value * DECK_TOP_FRACTION;
    const halfPull = Math.round(deckHeight.value * 0.42);
    const fullPull = Math.round(deckHeight.value + deckTop + 8);

    intro.value = withTiming(0, { duration: 300, easing: EASE_OUT });
    // The envelope rises into the space the intro copy vacates (web: the
    // scene's marginTop transitions 48 -> 0 on open).
    sceneLift.value = withTiming(-SCENE_GAP, { duration: 300, easing: EASE_OUT });

    // Seal pops, sags, then drops away — web offsets .1/.24/.34.
    seal.value = withDelay(at(0.1), withSequence(
      withTiming(1, { duration: at(0.14), easing: EASE_OUT }),
      withTiming(0.75, { duration: at(0.1), easing: EASE_OUT }),
      withTiming(0, { duration: at(0.1), easing: EASE_OUT }),
    ));
    sealScale.value = withDelay(at(0.1), withSequence(
      withTiming(1.08, { duration: at(0.14), easing: EASE_OUT }),
      withTiming(0.92, { duration: at(0.1), easing: EASE_OUT }),
      withTiming(0.6, { duration: at(0.1), easing: EASE_OUT }),
    ));
    sealDrop.value = withDelay(at(0.1), withSequence(
      withTiming(0, { duration: at(0.14) }),
      withTiming(16, { duration: at(0.1), easing: EASE_OUT }),
      withTiming(48, { duration: at(0.1), easing: EASE_OUT }),
    ));

    // Flap folds back over the top of the envelope (web: 0deg held to .16,
    // then to -172deg by .43).
    flap.value = withDelay(at(0.16), withTiming(1, { duration: at(0.27), easing: EASE_IN_OUT }));

    // Light grows from inside the envelope and is fully out by the end.
    // ONE sequence on purpose: this used to be two separate `glow.value = ...`
    // assignments in the same synchronous block, and the later simply replaced
    // the earlier — the bloom never played, and the value it was left holding
    // painted a stray gradient over the hand-off. Offsets .22/.61/.86/1 and
    // the .3/1/.8/0 opacity ramp come straight from the web keyframes.
    glow.value = withDelay(at(0.22), withSequence(
      withTiming(0.3, { duration: 1 }),
      withTiming(1, { duration: at(0.39), easing: EASE_OUT }),
      withTiming(0.8, { duration: at(0.25), easing: EASE_OUT }),
      withTiming(0, { duration: at(0.14), easing: EASE_OUT }),
    ));
    glowScale.value = withSequence(
      withTiming(0.55, { duration: at(0.22) }),
      withTiming(0.75, { duration: 1 }),
      withTiming(1.13, { duration: at(0.39), easing: EASE_OUT }),
      withTiming(1.28, { duration: at(0.25), easing: EASE_OUT }),
      withTiming(1.36, { duration: at(0.14), easing: EASE_OUT }),
    );

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

    // Cream wash: a circle blooming from the centre (web: scale .3 -> 1.3 over
    // the final 9%), not a rectangle cross-fade.
    wash.value = withDelay(at(0.91), withTiming(1, { duration: at(0.09), easing: EASE_OUT }));

    // Web parity: the mouth appears once the flap has BEGUN to lift (900ms),
    // and the folded flap drops behind the envelope at 1020ms so it doesn't
    // sit on top of the card as it comes out.
    timers.current.push(setTimeout(() => setPocketOpen(true), 900));
    timers.current.push(setTimeout(() => setFlapBehind(true), 1020));
    timers.current.push(setTimeout(onRevealStart, at(0.83)));
    timers.current.push(setTimeout(onRevealComplete, TOTAL_MS));
  }, [
    opening, reduced, onRevealStart, onRevealComplete, deckHeight, sceneHeight,
    intro, sceneOpacity, sceneShift, sceneLift, glow, glowScale, flap,
    deckY, deckOpacity, deckScale, seal, sealDrop, sealScale, wash,
  ]);

  const introStyle = useAnimatedStyle(() => ({ opacity: intro.value, transform: [{ translateY: (1 - intro.value) * -10 }] }));
  const sceneStyle = useAnimatedStyle(() => ({ opacity: sceneOpacity.value, transform: [{ translateY: sceneShift.value + sceneLift.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: glowScale.value }] }));
  const deckStyle = useAnimatedStyle(() => ({
    opacity: deckOpacity.value,
    transform: [{ translateY: deckY.value }, { scale: deckScale.value }],
  }));
  const sealStyle = useAnimatedStyle(() => ({ opacity: seal.value, transform: [{ translateY: sealDrop.value }, { scale: sealScale.value }] }));
  // Circle wipe: opacity AND scale, matching the web's .3 -> 1.3 bloom.
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value, transform: [{ scale: 0.3 + wash.value }] }));
  // rotateX folds the flap's far edge AWAY from the viewer, back over the
  // envelope — the real opening direction. It also fades past the midpoint so
  // the (unshaded) reverse side never reads as a flat slab.
  //
  // The translate/rotate/translate sandwich moves the pivot to the layer's TOP
  // EDGE. React Native has no transformOrigin, so a bare rotateX spun the flap
  // about its own middle: the crease travelled down the envelope instead of
  // staying put along the seam, which is what made the opening look wrong.
  const flapStyle = useAnimatedStyle(() => {
    const half = flapHeight.value / 2;
    return {
      transform: [
        { perspective: 900 },
        { translateY: -half },
        { rotateX: `${flap.value * -172}deg` },
        { translateY: half },
      ],
    };
  });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.intro, introStyle]}>
        {/* Lowercase "hi" to match the name beside it: firstNameOf()
            deliberately lowercases (the summary's whole voice is lowercase —
            "hey dhairya", "the initiator"), so a capital "Hi" next to a
            lowercase name read as a casing bug rather than a style. */}
        <BodyText style={styles.greeting}>hi {firstName || 'friend'},</BodyText>
        <BrandHeading variant="display" tone="brand" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.headline}>
          Frinq has read between your lines.
        </BrandHeading>
        <BodyText variant="intro" tone="secondary" style={styles.subcopy}>
          Open the envelope to see the friend you are when it really counts.
        </BodyText>
      </Animated.View>

      <Animated.View
        style={[styles.scene, sceneStyle]}
        onLayout={(e) => {
          sceneHeight.value = e.nativeEvent.layout.height;
          setSceneWidth(e.nativeEvent.layout.width);
        }}
      >
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
            // Centred on the envelope: (1 - 0.67) / 2.
            //
            // This was previously a tiny left offset, tuned by eye to make the
            // card LOOK centred — but it was compensating for a rendering bug
            // (the plaque image ignored its box, drew ~1.4x too wide and
            // re-centred itself on the screen). With the image fixed to
            // explicit pixels the box and the visible card finally coincide,
            // so honest centring is both correct and what actually looks
            // right. Don't reintroduce an eyeball offset here.
            style={[
              styles.deckHolder,
              deckStyle,
              sceneWidth > 0 && { width: sceneWidth * CARD_W_FRACTION, left: (sceneWidth * (1 - CARD_W_FRACTION)) / 2 },
            ]}
            onLayout={(e) => { deckHeight.value = e.nativeEvent.layout.height; }}
          >
            {/* Rendered only once the scene has been measured. Passing
                width={undefined} on the first frame sent the card down its
                own fallback path (a windowWidth * 0.7 guess plus a '100%'
                frame), which is WIDER than this holder — the card overflowed
                and its centred text ended up offset from the card's real
                centre. There is nothing to show before the envelope opens
                anyway, so waiting for the measurement costs nothing. */}
            {sceneWidth > 0 && (
              <SummaryHeroCard
                typeName={typeName}
                typeDefinition={typeDefinition}
                width={sceneWidth * CARD_W_FRACTION}
                // Name only during the reveal — the definition would be
                // unreadable in a ~1s beat, and half of it sits behind the
                // envelope anyway. The report page renders the full card.
                titleOnly
              />
            )}
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
        <Animated.View
          style={[styles.flapLayer, flapBehind && styles.flapLayerBehind, flapStyle]}
          pointerEvents="none"
          onLayout={(e) => { flapHeight.value = e.nativeEvent.layout.height; }}
        >
          <Flap points={`0,0 100,0 ${APEX_X},100`} fill={color.summary.envelopePaperLight} />
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
  // lineHeight 38 on a 32px Borel clipped the ascenders and the tail of the
  // 'q'; the web sets this in a serif at 1.08, which Borel cannot survive.
  headline: { marginTop: spacing.md, fontSize: 30, lineHeight: 44, textAlign: 'center' },
  subcopy: { marginTop: spacing.md, textAlign: 'center' },
  scene: { width: '100%', maxWidth: 346, aspectRatio: ENVELOPE_ASPECT, marginTop: SCENE_GAP },
  // Square and centred on the envelope's neck (web: left 50%, top 48%,
  // width 135%, aspect-ratio 1, translate(-50%,-50%)). The old offset
  // rectangle put the gradient's centre off-box, which is what left a bright
  // wedge hanging off the bottom-right once the bloom faded.
  glow: { position: 'absolute', zIndex: 1, left: '-17.5%', top: '48%', width: '135%', aspectRatio: 1, marginTop: '-67.5%' },
  envelopeBack: { ...StyleSheet.absoluteFill, zIndex: 0, borderRadius: radius.sm, backgroundColor: color.summary.envelopeBack, borderWidth: 1, borderColor: color.border.subtle },
  // Reaches far above the envelope, ends exactly at its bottom.
  deckWindow: { position: 'absolute', zIndex: 2, left: 0, right: 0, top: -720, bottom: 0, overflow: 'hidden' },
  deckHolder: { position: 'absolute', left: '11%', width: '78%', top: `${DECK_TOP_FRACTION * 100}%`, marginTop: 720 },
  pocket: { ...StyleSheet.absoluteFill, zIndex: 3 },
  // Only as tall as the flap triangle itself (its apex is the envelope's
  // seam), so the hinge maths above pivots on the envelope's top edge.
  flapLayer: { position: 'absolute', zIndex: 5, left: 0, right: 0, top: 0, height: `${APEX_Y}%`, backfaceVisibility: 'hidden' },
  flapLayerBehind: { zIndex: 1 },
  seal: { position: 'absolute', zIndex: 7, left: `${APEX_X}%`, top: `${APEX_Y}%`, width: '20%', aspectRatio: 1, marginLeft: '-10%', marginTop: '-10%' },
  sealInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Borel's loops overflow a tight line box; zeroing BrandHeading's padding
  // clipped the wordmark's top and tail.
  sealText: { fontSize: 12, lineHeight: 18, color: color.brand.cream },
  hint: { marginTop: spacing.xl },
  hintText: { textAlign: 'center' },
  // A circle far larger than the screen, centred and scaled up — the web's
  // 150vmax wipe. Also positioned outside root's padding box: absoluteFill
  // covers only the PADDING box, which left an uncovered strip down each side
  // that the glow bled through during the hand-off.
  wash: { position: 'absolute', zIndex: 10, width: WASH_SIZE, height: WASH_SIZE, borderRadius: WASH_SIZE / 2, left: '50%', top: '50%', marginLeft: -WASH_SIZE / 2, marginTop: -WASH_SIZE / 2, backgroundColor: color.bg.canvas },
});
