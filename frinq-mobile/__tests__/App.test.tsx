/**
 * @format
 * App entry smoke test: while boot is unresolved (state === 'checking') the app
 * shows only the boot splash — never a protected screen.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../src/app/App';

// Real pushService.ts imports @react-native-firebase/messaging, which isn't
// natively linked (or transform-allowed for Jest) yet. This test never lets
// boot resolve, so MainTabs/CommunityScreen never mount — this only
// satisfies the static import chain.
jest.mock('../src/services/push/pushService', () => ({}));

test('shows the boot splash and no protected content while checking', async () => {
  // A resolver that never settles keeps boot in 'checking'.
  const { getByTestId, queryByTestId } = render(<App resolveBoot={() => new Promise<never>(() => {})} />);
  await waitFor(() => expect(getByTestId('boot-splash')).toBeTruthy());
  expect(queryByTestId('screen-community')).toBeNull();
  expect(queryByTestId('screen-profile')).toBeNull();
});
