import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { BodyText } from '../../../design/components/Text';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { spacing } from '../../../design/tokens/spacing';
import { splashIntro } from '../../../design/tokens/motion';
import { loadPendingAcceptance } from '../../legal/pendingAcceptance';
import { loadPendingQuizState } from '../../quiz/pendingQuizState';

/** Reference 1. A resumed attempt returns to the earliest unfinished live
 * screen rather than replaying a decorative image page. Entrance timing
 * matches Figma node 163:247's keyframes (see tokens/motion.ts splashIntro). */
export function LandingScreen() {
  const navigation = useNavigation<any>();
  const reduced = useReducedMotion();

  const logoOpacity = useSharedValue(reduced ? 1 : 0);
  const logoScale = useSharedValue(reduced ? 1 : splashIntro.logoScale.startScale);
  const taglineOpacity = useSharedValue(reduced ? 1 : 0);
  const arrowOpacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    logoOpacity.value = withTiming(1, { duration: splashIntro.logoOpacity.duration, easing: Easing.bezier(...splashIntro.logoOpacity.easing) });
    logoScale.value = withTiming(1, { duration: splashIntro.logoScale.duration, easing: Easing.bezier(...splashIntro.logoScale.easing) });
    taglineOpacity.value = withDelay(splashIntro.tagline.delay, withTiming(1, { duration: splashIntro.tagline.duration, easing: Easing.bezier(...splashIntro.tagline.easing) }));
    arrowOpacity.value = withDelay(splashIntro.arrow.delay, withTiming(1, { duration: splashIntro.arrow.duration, easing: Easing.bezier(...splashIntro.arrow.easing) }));
  }, [reduced, logoOpacity, logoScale, taglineOpacity, arrowOpacity]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ scale: logoScale.value }] }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: arrowOpacity.value }));

  async function begin() {
    const pending = await loadPendingAcceptance();
    const quizState = await loadPendingQuizState();
    navigation.navigate(!pending ? 'ReferenceIntro' : quizState?.name ? 'Phone' : 'Name');
  }

  return (
    <ReferenceJourneyFrame tone="maroon">
      <View style={styles.body}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image testID="landing-logo" source={require('../../../../Public/Assets/frinq.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Animated.View testID="landing-arrow-wrap" style={[styles.arrowWrap, arrowStyle]}>
          <PressableScale accessibilityRole="button" accessibilityLabel="Start finding your Frinq" onPress={begin} style={styles.arrow}>
            <Image testID="landing-next-arrow" source={require('../../../../Public/Assets/White arrow.png')} style={styles.arrowImage} resizeMode="contain" />
          </PressableScale>
        </Animated.View>
        <Animated.View style={taglineStyle}>
          <BodyText tone="onMaroon" variant="intro" style={styles.tagline}>find your frequency.{`\n`}find your frinq.</BodyText>
        </Animated.View>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xxxl, paddingBottom: spacing.lg },
  logoWrap: { marginTop: 'auto', marginBottom: spacing.xxxl },
  logo: { width: 180, height: 180 / (260 / 144) },
  arrowWrap: { marginTop: 'auto', marginBottom: spacing.xxxl },
  arrow: { width: 110, height: 110 / (218 / 96), alignItems: 'center', justifyContent: 'center' },
  arrowImage: { width: '100%', height: '100%' },
  tagline: { textAlign: 'center' },
});
