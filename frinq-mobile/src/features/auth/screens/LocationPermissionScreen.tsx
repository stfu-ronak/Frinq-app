import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { spacing, touchTarget } from '../../../design/tokens/spacing';

/** Reference 16. This is an explicit in-app security acknowledgement, never a
 * native location request. City is still collected later as a quiz answer. */
export function LocationPermissionScreen() {
  const navigation = useNavigation<any>();
  const continueToPrivacy = () => navigation.navigate('Legal');

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View style={styles.body}>
        <Image source={require('../../../../Public/Assets/location.png')} style={styles.icon} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <BrandHeading style={styles.heading}>location services</BrandHeading>
        <BodyText tone="secondary" style={styles.copy}>we use your area to help with nearby community activity. your exact device location is never collected.</BodyText>
      </View>
      <PrimaryButton label="Set location services" onPress={continueToPrivacy} style={styles.cta} />
      <PressableScale accessibilityRole="button" accessibilityLabel="Not now" onPress={continueToPrivacy} style={styles.skip}>
        <BodyText tone="secondary">Not now</BodyText>
      </PressableScale>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl },
  icon: { width: 76, height: 76, marginBottom: spacing.xl },
  heading: { fontSize: 42, lineHeight: 55, textAlign: 'center', marginBottom: spacing.lg },
  copy: { maxWidth: 286, textAlign: 'center', fontSize: 17, lineHeight: 26 },
  cta: { alignSelf: 'stretch', marginBottom: spacing.sm },
  skip: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
});
