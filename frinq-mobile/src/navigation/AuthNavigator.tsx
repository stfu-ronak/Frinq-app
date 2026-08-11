import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../features/auth/screens/LandingScreen';
import { ReferenceIntroScreen } from '../features/auth/screens/ReferenceIntroScreen';
import { DudesIntroScreen } from '../features/auth/screens/DudesIntroScreen';
import { LocationPermissionScreen } from '../features/auth/screens/LocationPermissionScreen';
import { NameScreen } from '../features/auth/screens/NameScreen';
import { PhoneScreen } from '../features/auth/screens/PhoneScreen';
import { OtpScreen, OtpRouteParams } from '../features/auth/screens/OtpScreen';
import { LegalAcceptanceScreen } from '../features/legal/screens/LegalAcceptanceScreen';
import { LegalDocumentScreen, LegalDocumentRouteParams } from '../features/legal/screens/LegalDocumentScreen';
import { PriorSession } from '../services/api/contracts';

export type AuthStackParamList = {
  Landing: undefined;
  ReferenceIntro: undefined;
  Legal: undefined;
  DudesIntro: undefined;
  LocationPermission: undefined;
  /** Post-OTP: the credential is already stored but auth hasn't been flipped
   *  yet, so this screen still lives in the pre-auth stack. It carries what
   *  the quiz-state flush needs, since that now runs here instead of in
   *  OtpScreen. */
  Name: { userId: string; phone: string; priorSession: PriorSession | null };
  /** `verified` is set only when arriving BACK from Name — it carries the
   *  already-proven credential context so the same number doesn't get
   *  re-OTP'd. */
  Phone: { verified?: { userId: string; phone: string; priorSession: PriorSession | null } } | undefined;
} & OtpRouteParams &
  LegalDocumentRouteParams;

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Name is collected AFTER OTP now, so it's never a pre-auth landing target. */
export function nextLandingRoute({ hasPendingAcceptance }: { hasPendingAcceptance: boolean }): 'ReferenceIntro' | 'Phone' {
  return hasPendingAcceptance ? 'Phone' : 'ReferenceIntro';
}

/** Pre-auth flow: Landing (tap to begin) -> Legal acceptance -> the duck
 *  illustration intro -> location-permission (skippable, never gates
 *  progress) -> Phone -> OTP -> Name. Name sits AFTER verification (the
 *  credential is stored but auth is deliberately not flipped until Name
 *  finishes) so the post-auth welcome can greet the user by the name they
 *  just gave. Legal document detail is a modal-ish stack screen reachable
 *  from the acceptance checkboxes. */
export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }} initialRouteName="Landing">
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="ReferenceIntro" component={ReferenceIntroScreen} />
      <Stack.Screen name="DudesIntro" component={DudesIntroScreen} />
      <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />
      <Stack.Screen name="Legal">
        {({ navigation }) => <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: () => navigation.navigate('Phone') }} />}
      </Stack.Screen>
      <Stack.Screen name="Name" component={NameScreen} />
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
