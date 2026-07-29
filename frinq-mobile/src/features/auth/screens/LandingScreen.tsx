import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { loadPendingAcceptance } from '../../legal/pendingAcceptance';
import { loadPendingQuizState } from '../../quiz/pendingQuizState';

/** Reference 1. A resumed attempt returns to the earliest unfinished live
 * screen rather than replaying a decorative image page. */
export function LandingScreen() {
  const navigation = useNavigation<any>();

  async function begin() {
    const pending = await loadPendingAcceptance();
    const quizState = await loadPendingQuizState();
    navigation.navigate(!pending ? 'ReferenceIntro' : quizState?.name ? 'Phone' : 'Name');
  }

  return (
    <ReferenceJourneyFrame tone="maroon">
      <View style={styles.body}>
        <BrandHeading tone="onMaroon" style={styles.logo}>frinq</BrandHeading>
        <PressableScale accessibilityRole="button" accessibilityLabel="Start finding your Frinq" onPress={begin} style={styles.arrow}>
          <Image source={require('../../../../Public/Assets/White arrow.png')} style={styles.arrowImage} resizeMode="contain" />
        </PressableScale>
        <BodyText tone="onMaroon" style={styles.tagline}>find your frequency.{`\n`}find your frinq.</BodyText>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xxxl, paddingBottom: spacing.lg },
  logo: { fontSize: 66, lineHeight: 82, marginTop: 'auto', marginBottom: spacing.xxxl },
  arrow: { width: 130, minHeight: touchTarget.preferred + 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.brand.cream, marginBottom: 'auto' },
  arrowImage: { width: 130, height: 48 },
  tagline: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
});
