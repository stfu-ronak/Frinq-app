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

// Real pushService.ts imports @react-native-firebase/messaging, which isn't
// natively linked (or transform-allowed for Jest) yet.
jest.mock('../../services/push/pushService', () => ({
  hasPushPermission: async () => true,
  hasShownPushOptInPrompt: async () => true,
  markPushOptInPromptShown: async () => {},
  registerCurrentToken: async () => {},
  requestPushPermission: async () => 'granted',
  setPushEnabled: async () => {},
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
  it('opens straight onto Profile — Events and Community are unmounted from the bar', async () => {
    const { findByText, queryByRole } = renderTabs();

    expect(await findByText('Ada')).toBeTruthy(); // real ProfileScreen content
    expect(queryByRole('button', { name: 'Events' })).toBeNull();
    expect(queryByRole('button', { name: 'Community' })).toBeNull();
  });

  it('hides the tab bar entirely rather than showing a one-item bar', async () => {
    const { findByText, queryByRole } = renderTabs();
    await findByText('Ada');

    // With a single destination there is nothing to switch between, so no tab
    // button should be rendered at all — a lone tab is dead chrome.
    expect(queryByRole('button', { name: 'Profile' })).toBeNull();
  });

  it('reaches Settings from Profile (no Settings tab)', async () => {
    const { findByText, findByLabelText, queryByRole } = renderTabs();
    await findByText('Ada');
    expect(queryByRole('button', { name: 'Settings' })).toBeNull();

    fireEvent.press(await findByLabelText('settings'));
    expect(await findByText('settings')).toBeTruthy(); // real SettingsScreen content
  });

  it('navigates from Settings through the Legal hub into a LegalDocument route with the right doc param', async () => {
    const { findByLabelText, findByText } = renderTabs();
    await findByText('Ada');

    fireEvent.press(await findByLabelText('settings'));
    fireEvent.press(await findByLabelText('legal'));
    fireEvent.press(await findByLabelText('view Frinq Squad Rules in app'));

    expect(await findByText('Frinq Squad Rules')).toBeTruthy();
  });
});
