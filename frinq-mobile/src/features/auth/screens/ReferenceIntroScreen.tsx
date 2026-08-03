import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { radius, spacing } from '../../../design/tokens/spacing';

/** Reference 3: explains Frinq's real-world connection premise. */
export function ReferenceIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <ReferenceJourneyFrame tone="maroon" onBack={() => navigation.goBack()}>
      <View style={styles.body}>
        <ReferenceIntroPattern />
        <BrandHeading testID="reference-intro-logo" tone="onMaroon" style={styles.logo}>frinq</BrandHeading>
        <BrandHeading testID="reference-intro-heading" tone="onMaroon" style={styles.heading}>match with{`\n`}the right people{`\n`}for real life{`\n`}activities.</BrandHeading>
        <PressableScale accessibilityRole="button" accessibilityLabel="Find your Frinq" onPress={() => navigation.navigate('DudesIntro')} style={styles.cta}>
          <BodyText variant="bodyStrong" style={styles.ctaText}>Find your Frinq</BodyText>
        </PressableScale>
      </View>
    </ReferenceJourneyFrame>
  );
}

function ReferenceIntroPattern() {
  const lobePath = 'M195 205 C145 205 105 245 105 300 C45 300 0 345 0 405 C0 465 45 510 105 510 C105 565 145 605 195 605 C245 605 285 565 285 510 C345 510 390 465 390 405 C390 345 345 300 285 300 C285 245 245 205 195 205 Z';
  return (
    <View pointerEvents="none" style={styles.pattern}>
      <Svg testID="reference-intro-pattern" width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0.8, 1, 1.23, 1.47, 1.71].map((scale, index) => (
          <Path
            key={scale}
            testID={index === 0 ? 'reference-intro-lobed-pattern' : undefined}
            d={lobePath}
            transform={`translate(195 405) scale(${scale}) translate(-195 -405)`}
            stroke={color.brand.peach}
            strokeOpacity={0.3}
            strokeWidth={0.55}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: spacing.xxl },
  pattern: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  logo: { fontSize: 18, lineHeight: 30, textAlign: 'center' },
  heading: { width: '100%', fontSize: 28, lineHeight: 42, textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' },
  cta: { width: '86%', minHeight: 52, borderRadius: radius.md, backgroundColor: color.brand.cream, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: color.brand.maroon, fontSize: 22, lineHeight: 28 },
});
