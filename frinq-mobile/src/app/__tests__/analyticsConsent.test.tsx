import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';

let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};
jest.mock('../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
}));

jest.mock('../../services/telemetry/analytics', () => ({
  setAnalyticsConsent: jest.fn(),
}));

// AppProviders pulls in GestureHandlerRootView/NavigationContainer/SessionProvider
// etc. — only AnalyticsConsentProvider/useAnalyticsConsent is under test here,
// so import them directly rather than mounting the whole provider tree.
import { AnalyticsConsentProvider, useAnalyticsConsent } from '../AppProviders';

function Probe() {
  const { enabled, setEnabled } = useAnalyticsConsent();
  return (
    <>
      <Text testID="state">{String(enabled)}</Text>
      <Text testID="toggle" onPress={() => setEnabled(!enabled)}>
        toggle
      </Text>
    </>
  );
}

beforeEach(() => {
  mockStoreData = new Map();
});

describe('AnalyticsConsentProvider', () => {
  it('defaults to off with nothing persisted', async () => {
    const { getByTestId } = render(<AnalyticsConsentProvider><Probe /></AnalyticsConsentProvider>);
    await waitFor(() => expect(getByTestId('state').props.children).toBe('false'));
  });

  it('restores a previously persisted "on" choice', async () => {
    mockStoreData.set('analytics_consent', '1');
    const { getByTestId } = render(<AnalyticsConsentProvider><Probe /></AnalyticsConsentProvider>);
    await waitFor(() => expect(getByTestId('state').props.children).toBe('true'));
  });

  it('persists a toggle so it survives a remount', async () => {
    const { getByTestId, unmount } = render(<AnalyticsConsentProvider><Probe /></AnalyticsConsentProvider>);
    await waitFor(() => expect(getByTestId('state').props.children).toBe('false'));

    await act(async () => {
      getByTestId('toggle').props.onPress();
    });
    await waitFor(() => expect(mockStoreData.get('analytics_consent')).toBe('1'));
    unmount();

    const remounted = render(<AnalyticsConsentProvider><Probe /></AnalyticsConsentProvider>);
    await waitFor(() => expect(remounted.getByTestId('state').props.children).toBe('true'));
  });
});
