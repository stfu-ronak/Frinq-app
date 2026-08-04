import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { motion } from '../../../design/tokens/motion';

/** Reference 3: explains Frinq's real-world connection premise. */
export function ReferenceIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <ReferenceJourneyFrame tone="maroon">
      <View style={styles.body}>
        <ReferenceIntroPattern />
        <Image testID="reference-intro-logo" source={require('../../../../Public/Assets/frinq.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.headingWrap}>
          <Image
            testID="reference-intro-heading"
            source={require('../../../../Public/Assets/match with the right people for real life activities..png')}
            style={styles.heading}
            resizeMode="contain"
          />
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="Find your Frinq" onPress={() => navigation.navigate('DudesIntro')} style={styles.cta}>
          <Image source={require('../../../../Public/Assets/Frame 406 (1).png')} style={styles.ctaImage} resizeMode="contain" />
        </PressableScale>
      </View>
    </ReferenceJourneyFrame>
  );
}

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** The 5 concentric lobed rings behind the heading, exported individually
 *  (Public/Assets/Union[-N].png), smallest-to-largest, each bottom-anchored. */
const RING_ASSETS = [
  { testID: 'reference-intro-lobed-pattern', source: require('../../../../Public/Assets/Union.png'), aspectRatio: 402 / 495 },
  { source: require('../../../../Public/Assets/Union-1.png'), aspectRatio: 402 / 563 },
  { source: require('../../../../Public/Assets/Union-2.png'), aspectRatio: 402 / 627 },
  { source: require('../../../../Public/Assets/Union-3.png'), aspectRatio: 402 / 691 },
  { source: require('../../../../Public/Assets/Union-4.png'), aspectRatio: 402 / 783 },
];

function ReferenceIntroPattern() {
  return (
    <View testID="reference-intro-pattern" pointerEvents="none" style={styles.pattern} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {RING_ASSETS.map((ring, index) => (
        <AnimatedRing key={index} index={index} testID={ring.testID} source={ring.source} aspectRatio={ring.aspectRatio} />
      ))}
    </View>
  );
}

/** Smallest ring blooms in first, each larger ring following with a stagger
 *  step — a small-to-big reveal outward from the centre. The percent-width +
 *  aspectRatio sizing lives on the plain outer View (proven to resolve
 *  correctly, unlike putting both on the animated node itself — see the
 *  heading/CTA fix below); the animated Image just fills that box. */
function AnimatedRing({ source, aspectRatio, index, testID }: { source: number; aspectRatio: number; index: number; testID?: string }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.6);

  useEffect(() => {
    if (reduced) return;
    scale.value = withDelay(index * motion.enter.staggerStep, withTiming(1, { duration: motion.enter.duration, easing: Easing.bezier(...motion.enter.easing) }));
  }, [reduced, index, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.ringWrap, { aspectRatio }]}>
      <AnimatedImage testID={testID} source={source} style={[styles.ring, animatedStyle]} resizeMode="stretch" />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 0 },
  // Cancels ReferenceJourneyFrame's content padding so the rings bleed flush
  // to the device edges instead of sitting inset inside the padded column.
  pattern: { position: 'absolute', top: 0, bottom: 0, left: -spacing.xl, right: -spacing.xl, overflow: 'hidden' },
  ringWrap: { position: 'absolute', bottom: 0, left: 0, width: '100%' },
  ring: { width: '100%', height: '100%' },
  logo: { width: 100, height: 100 / (260 / 144), alignSelf: 'center' },
  headingWrap: { width: '82%', aspectRatio: 1007 / 897, marginTop: 'auto', marginBottom: 'auto' },
  heading: { width: '100%', height: '100%' },
  // Matches ReferenceCtaFooter's geometry/offset (76% width, and the same
  // bottom reserve used when a screen has no secondary link below its CTA)
  // so this image-based button lines up with the rest of the reference journey.
  cta: { width: '76%', aspectRatio: 1228 / 192, marginBottom: touchTarget.min + spacing.lg, alignItems: 'center', justifyContent: 'center' },
  ctaImage: { width: '100%', height: '100%' },
});
