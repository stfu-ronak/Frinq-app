import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';

/** Reference 3: explains Frinq's real-world connection premise. */
export function ReferenceIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <ReferenceJourneyFrame tone="maroon" wave>
      <View style={styles.body}>
        <BrandHeading tone="onMaroon" style={styles.logo}>frinq</BrandHeading>
        <BrandHeading tone="onMaroon" style={styles.heading}>match with{`\n`}the right people{`\n`}for real life{`\n`}activities.</BrandHeading>
        <PressableScale accessibilityRole="button" accessibilityLabel="Find your Frinq" onPress={() => navigation.navigate('DudesIntro')} style={styles.cta}>
          <BodyText variant="bodyStrong" style={styles.ctaText}>Find your Frinq</BodyText>
        </PressableScale>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  logo: { fontSize: 23, lineHeight: 34, textAlign: 'center' },
  heading: { width: '100%', fontSize: 42, lineHeight: 55, textAlign: 'left', marginTop: 'auto', marginBottom: 'auto' },
  cta: { width: '100%', minHeight: touchTarget.preferred + 8, borderRadius: radius.lg, backgroundColor: color.brand.cream, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: color.brand.maroon },
});
