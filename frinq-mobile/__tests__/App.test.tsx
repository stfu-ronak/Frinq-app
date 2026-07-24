/**
 * @format
 * App entry smoke test: while boot is unresolved (state === 'checking') the app
 * shows only the boot splash — never a protected screen.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../src/app/App';

test('shows the boot splash and no protected content while checking', async () => {
  // A resolver that never settles keeps boot in 'checking'.
  const { getByTestId, queryByTestId } = render(<App resolveBoot={() => new Promise<never>(() => {})} />);
  await waitFor(() => expect(getByTestId('boot-splash')).toBeTruthy());
  expect(queryByTestId('screen-community')).toBeNull();
  expect(queryByTestId('screen-profile')).toBeNull();
});
