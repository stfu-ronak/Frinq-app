import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';

/** Reference 16. This is an explicit in-app security acknowledgement, never a
 * native location request. City is still collected later as a quiz answer. */
export function LocationPermissionScreen() {
  const navigation = useNavigation<any>();
  const continueToPrivacy = () => navigation.navigate('Legal');

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View testID="location-permission-body" style={styles.body}>
        <Image source={require('../../../../Public/Assets/location.png')} style={styles.icon} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <BrandHeading tone="brand" style={styles.heading}>location services</BrandHeading>
        <BodyText tone="muted" style={styles.copy}>we use your location to show you potential matches in your area.</BodyText>
        <View style={styles.actions}>
          <PrimaryButton label="Set location services" onPress={continueToPrivacy} style={styles.locationAction} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Not now" onPress={continueToPrivacy} style={styles.skip}>
            <BodyText style={styles.skipText}>Not now</BodyText>
          </PressableScale>
        </View>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 86, paddingBottom: 0 },
  icon: { width: 62, height: 62, marginBottom: spacing.xxl },
  heading: { fontSize: 28, lineHeight: 42, textAlign: 'center', marginBottom: spacing.xs },
  copy: { maxWidth: 310, textAlign: 'center', fontSize: 14, lineHeight: 21 },
  actions: { width: '100%', alignItems: 'center', marginTop: 'auto' },
  locationAction: { width: '86%', minHeight: 52, borderRadius: radius.md },
  skip: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  skipText: { color: color.brand.maroon, fontSize: 16, lineHeight: 24 },
});
