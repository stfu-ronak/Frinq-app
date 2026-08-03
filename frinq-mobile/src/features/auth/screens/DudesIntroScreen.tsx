import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { radius, spacing } from '../../../design/tokens/spacing';

/** Reference 5 duck introduction. */
export function DudesIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View style={styles.body}>
        <BrandHeading testID="dudes-intro-heading" style={styles.heading}>lets find your frinq</BrandHeading>
        <Image testID="dudes-intro-art" source={require('../../../../Public/Assets/dudes 1.png')} style={styles.art} resizeMode="contain" resizeMethod="scale" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <PrimaryButton label="Let's go" onPress={() => navigation.navigate('LocationPermission')} style={styles.cta} />
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 128, paddingBottom: spacing.xl },
  heading: { textAlign: 'center', fontSize: 28, lineHeight: 42 },
  art: { width: '100%', height: 270, marginTop: 104, flex: 0 },
  cta: { width: '86%', minHeight: 52, borderRadius: radius.md, marginTop: 'auto' },
});
