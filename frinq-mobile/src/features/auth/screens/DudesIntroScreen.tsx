import React from 'react';
import { Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SimpleStepFrame } from '../../quiz/components/SimpleStepFrame';

/** Pre-auth duck-illustration intro, between Legal acceptance and the quiz's
 *  own s0 intro — matches the "lets find your frinq" design mockup. Purely
 *  decorative/motivational; carries no data, just a tap-through. */
export function DudesIntroScreen() {
  const navigation = useNavigation<any>();
  return (
    <SimpleStepFrame
      stepId="dudes-intro"
      onBack={() => navigation.goBack()}
      heading="lets find your frinq"
      continueLabel="let's go"
      onContinue={() => navigation.navigate('LocationPermission')}
    >
      <Image
        source={require('../../../assets/images/dudes1.png')}
        style={{ width: '100%', height: 260, marginTop: 24 }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </SimpleStepFrame>
  );
}
