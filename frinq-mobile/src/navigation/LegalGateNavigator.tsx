import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LegalAcceptanceScreen } from '../features/legal/screens/LegalAcceptanceScreen';
import { LegalDocumentScreen, LegalDocumentRouteParams } from '../features/legal/screens/LegalDocumentScreen';

type LegalGateStackParamList = { Legal: undefined } & LegalDocumentRouteParams;
const Stack = createNativeStackNavigator<LegalGateStackParamList>();

/** Returning user whose server-side terms/privacy acceptance is stale.
 *  Small dedicated stack (not the full AuthNavigator) since a signed-in user
 *  only needs re-acceptance + the document detail screens. */
export function LegalGateNavigator({ onAccepted }: { onAccepted: () => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Legal">{() => <LegalAcceptanceScreen mode={{ kind: 'returning', onAccepted }} />}</Stack.Screen>
      <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
