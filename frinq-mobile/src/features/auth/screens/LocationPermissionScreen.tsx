import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BodyText } from '../../../design/components/Text';
import { ReferenceCtaFooter } from '../components/ReferenceCtaFooter';
import { spacing } from '../../../design/tokens/spacing';

/** Reference 16. This is an explicit in-app security acknowledgement, never a
 * native location request. City is still collected later as a quiz answer.
 * Button/footer geometry here is the placement source of truth for the rest
 * of the pre-auth reference journey — see ReferenceCtaFooter. */
export function LocationPermissionScreen() {
  const navigation = useNavigation<any>();
  const continueToPrivacy = () => navigation.navigate('Legal');

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View testID="location-permission-body" style={styles.body}>
        <Image testID="location-pin-art" source={require('../../../../Public/Assets/Group 1261154503.png')} style={styles.icon} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <Image testID="location-title-art" source={require('../../../../Public/Assets/location services.png')} style={styles.titleArt} resizeMode="contain" accessibilityLabel="location services" />
        <BodyText tone="muted" variant="intro" style={styles.copy}>we use your location to show you potential matches in your area.</BodyText>
        <ReferenceCtaFooter label="Set location services" onPress={continueToPrivacy} secondaryLabel="Not now" onSecondaryPress={continueToPrivacy} />
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 86, paddingBottom: 0 },
  icon: { width: 43, height: 61, marginBottom: spacing.xxl },
  titleArt: { width: 331, height: 40, marginBottom: spacing.xs },
  copy: { maxWidth: 310, textAlign: 'center', marginTop: 5 },
});
