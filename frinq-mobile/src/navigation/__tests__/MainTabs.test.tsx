import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainTabs } from '../MainTabs';

const mockUseSession = jest.fn();
jest.mock('../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};
jest.mock('../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
}));

const USER = {
  id: 'user-1',
  phone: '+919876543210',
  display_name: 'Ada',
  gender: null,
  age: null,
  ncr_zone: null,
  community_slug: null,
  onboarding_complete: true,
  onboarding_state: 'active',
  banned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderTabs() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <NavigationContainer>
          <MainTabs />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
  mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
});

describe('MainTabs', () => {
  it('starts on the Community tab', async () => {
    const { findByTestId } = renderTabs();
    expect(await findByTestId('screen-community')).toBeTruthy();
  });

  it('switches to Profile and Settings tabs', async () => {
    const { findByTestId, getByRole, findByText } = renderTabs();
    await findByTestId('screen-community');

    fireEvent.press(getByRole('button', { name: 'Profile' }));
    expect(await findByText('Ada')).toBeTruthy(); // real ProfileScreen content

    fireEvent.press(getByRole('button', { name: 'Settings' }));
    expect(await findByText('settings')).toBeTruthy(); // real SettingsScreen content
  });

  it('navigates from Settings through the Legal hub into a LegalDocument route with the right doc param', async () => {
    const { findByTestId, getByRole, findByLabelText, findByText } = renderTabs();
    await findByTestId('screen-community');

    fireEvent.press(getByRole('button', { name: 'Settings' }));
    fireEvent.press(await findByLabelText('legal'));
    fireEvent.press(await findByLabelText('view Community Rules in app'));

    expect(await findByText('Community Rules')).toBeTruthy();
  });
});
