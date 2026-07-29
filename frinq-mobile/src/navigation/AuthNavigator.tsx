import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../features/auth/screens/LandingScreen';
import { DudesIntroScreen } from '../features/auth/screens/DudesIntroScreen';
import { LocationPermissionScreen } from '../features/auth/screens/LocationPermissionScreen';
import { QuizIntroScreen } from '../features/auth/screens/QuizIntroScreen';
import { NameScreen } from '../features/auth/screens/NameScreen';
import { PhoneScreen } from '../features/auth/screens/PhoneScreen';
import { OtpScreen, OtpRouteParams } from '../features/auth/screens/OtpScreen';
import { LegalAcceptanceScreen } from '../features/legal/screens/LegalAcceptanceScreen';
import { LegalDocumentScreen, LegalDocumentRouteParams } from '../features/legal/screens/LegalDocumentScreen';

export type AuthStackParamList = {
  Landing: undefined;
  Legal: undefined;
  DudesIntro: undefined;
  LocationPermission: undefined;
  QuizIntro: undefined;
  Name: undefined;
  Phone: undefined;
} & OtpRouteParams &
  LegalDocumentRouteParams;

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Pre-auth flow: Landing (tap to begin) -> Legal acceptance -> the duck
 *  illustration intro -> location-permission (skippable, never gates
 *  progress) -> the quiz's own s0 intro -> Name -> Phone -> OTP. `s0`/`name`
 *  are genuinely pre-auth (every other quiz endpoint requires a session;
 *  only /quiz/start and these two local-only steps run before one exists) —
 *  see docs/route-parity-matrix.md's Task 31 update for why this isn't wired
 *  into the authenticated QuizNavigator instead. Legal document detail is a
 *  modal-ish stack screen reachable from the acceptance checkboxes. */
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Landing">
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Legal">
        {({ navigation }) => <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: () => navigation.navigate('DudesIntro') }} />}
      </Stack.Screen>
      <Stack.Screen name="DudesIntro" component={DudesIntroScreen} />
      <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />
      <Stack.Screen name="QuizIntro" component={QuizIntroScreen} />
      <Stack.Screen name="Name" component={NameScreen} />
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
