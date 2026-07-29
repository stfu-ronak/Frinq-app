import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';

/** Reference 5 duck introduction. */
export function DudesIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View style={styles.body}>
        <BrandHeading style={styles.heading}>lets find your frinq</BrandHeading>
        <Image source={require('../../../../Public/Assets/dudes 1.png')} style={styles.art} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <PrimaryButton label="Let's go" onPress={() => navigation.navigate('LocationPermission')} style={styles.cta} />
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 104, paddingBottom: spacing.xl },
  heading: { textAlign: 'center', fontSize: 44, lineHeight: 57 },
  art: { width: '100%', height: 300, marginTop: spacing.xxxl, flex: 1 },
  cta: { alignSelf: 'stretch', marginTop: spacing.xl },
});
