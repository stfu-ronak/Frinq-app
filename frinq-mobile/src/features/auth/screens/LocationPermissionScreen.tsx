import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';

/** Pre-auth "location services" screen, between the dudes intro and Phone —
 *  matches the design mockup's copy/layout. Deliberately does NOT request
 *  the real Android location permission or declare it in the manifest: this
 *  app never uses GPS anywhere (city/area are typed/picked explicitly in the
 *  quiz), and scripts/verify-store-assets.mjs enforces that as a hard,
 *  tested privacy/store-compliance policy (ACCESS_FINE_LOCATION is on its
 *  forbidden-permissions list). Both buttons are equivalent no-op
 *  acknowledgments that simply continue — this is copy/UI only. */
export function LocationPermissionScreen() {
  const navigation = useNavigation<any>();

  return (
    <Screen scroll>
      <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} haptic={false} style={styles.back}>
        <Svg width={20} height={16} viewBox="0 0 20 16" accessibilityElementsHidden importantForAccessibility="no">
          <Path d="M8 1.5L1.5 8L8 14.5M2 8H19" stroke={color.text.primary} strokeWidth={1.5} fill="none" />
        </Svg>
      </PressableScale>

      <View style={styles.body}>
        <Image
          source={require('../../../assets/images/location.png')}
          style={styles.icon}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <BrandHeading variant="display" style={styles.heading}>location services</BrandHeading>
        <BodyText variant="body" tone="secondary" style={styles.copy}>
          we use your area to show you potential matches nearby.
        </BodyText>
      </View>

      <PrimaryButton label="Continue" onPress={() => navigation.navigate('QuizIntro')} style={styles.setButton} />
      <PressableScale accessibilityRole="button" onPress={() => navigation.navigate('QuizIntro')} style={styles.skip}>
        <BodyText variant="body" tone="secondary">Not now</BodyText>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: touchTarget.preferred, height: touchTarget.preferred, justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', marginTop: spacing.xxl },
  icon: { width: 64, height: 64, marginBottom: spacing.lg },
  heading: { textAlign: 'center', marginBottom: spacing.md },
  copy: { textAlign: 'center', maxWidth: 280 },
  setButton: { alignSelf: 'stretch' },
  skip: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', marginTop: spacing.sm },
});
