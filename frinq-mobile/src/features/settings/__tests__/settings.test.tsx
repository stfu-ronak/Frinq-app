import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CommunitySettingsScreen } from '../screens/CommunitySettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

const mockUseAnalyticsConsent = jest.fn();
jest.mock('../../../app/AppProviders', () => ({
  useAnalyticsConsent: () => mockUseAnalyticsConsent(),
}));

const mockPerformLogout = jest.fn();
jest.mock('../logoutService', () => ({
  performLogout: (...args: unknown[]) => mockPerformLogout(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SettingsScreen', () => {
  it('navigates to each settings destination', async () => {
    mockUseSession.mockReturnValue({ apiClient: {}, coordinator: {} });
    const { findByLabelText } = renderWithClient(<SettingsScreen />);

    fireEvent.press(await findByLabelText('community notifications'));
    expect(mockNavigate).toHaveBeenCalledWith('CommunitySettings');

    fireEvent.press(await findByLabelText('privacy & analytics'));
    expect(mockNavigate).toHaveBeenCalledWith('PrivacySettings');

    fireEvent.press(await findByLabelText('legal'));
    expect(mockNavigate).toHaveBeenCalledWith('Legal');

    fireEvent.press(await findByLabelText('support'));
    expect(mockNavigate).toHaveBeenCalledWith('Support');

    fireEvent.press(await findByLabelText('delete account'));
    expect(mockNavigate).toHaveBeenCalledWith('Account');
  });

  it('logs out via performLogout, disabling the button while in flight', async () => {
    let resolveLogout: () => void;
    mockPerformLogout.mockReturnValue(new Promise<void>((resolve) => { resolveLogout = resolve; }));
    mockUseSession.mockReturnValue({ apiClient: 'the-api-client', coordinator: 'the-coordinator' });

    const { findByLabelText } = renderWithClient(<SettingsScreen />);
    const logoutButton = await findByLabelText('log out');
    fireEvent.press(logoutButton);

    await waitFor(() => expect(logoutButton.props.accessibilityState.busy).toBe(true));
    expect(mockPerformLogout).toHaveBeenCalledWith('the-api-client', 'the-coordinator', expect.anything());

    resolveLogout!();
    await waitFor(() => expect(logoutButton.props.accessibilityState.busy).toBe(false));
  });
});

describe('CommunitySettingsScreen', () => {
  it('loads and shows the current mute state as a switch', async () => {
    mockUseSession.mockReturnValue({
      apiClient: { request: jest.fn().mockResolvedValue({ archetype_slug: 'quiet-storm', name: 'x', description: 'x', muted: true }) },
    });
    const { findByLabelText } = renderWithClient(<CommunitySettingsScreen />);
    const toggle = await findByLabelText('notify me about new messages');
    expect(toggle.props.value).toBe(false); // muted=true -> "notify me" switch is OFF
  });

  it('optimistically toggles and reverts if the server rejects it', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ archetype_slug: 'quiet-storm', name: 'x', description: 'x', muted: false })
      .mockRejectedValueOnce(new Error('boom'));
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findByRole } = renderWithClient(<CommunitySettingsScreen />);
    const toggle = await findByLabelText('notify me about new messages');
    expect(toggle.props.value).toBe(true); // muted=false -> ON

    fireEvent(toggle, 'valueChange', false); // user turns notifications off (muted=true) -> server rejects

    // The optimistic flip and its revert both settle from a mocked rejection
    // with no real network delay, so the only reliably-observable outcome is
    // the end state: an error shown, and the toggle back where it started.
    await findByRole('alert');
    await waitFor(() => expect(toggle.props.value).toBe(true));
  });

  it('does not render an interactive switch when the initial fetch fails', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockRejectedValue(new Error('network')) } });
    const { findByRole, queryByLabelText } = renderWithClient(<CommunitySettingsScreen />);

    await findByRole('alert'); // "couldn't load your preferences"
    // A switch defaulting to some baseline while the real preference is
    // unknown would let a user fire a PATCH from a false starting point.
    expect(queryByLabelText('notify me about new messages')).toBeNull();
  });
});

describe('PrivacySettingsScreen', () => {
  it('reflects and toggles analytics consent with no backend call', async () => {
    const setEnabled = jest.fn();
    mockUseAnalyticsConsent.mockReturnValue({ enabled: false, setEnabled });

    const { findByLabelText } = renderWithClient(<PrivacySettingsScreen />);
    const toggle = await findByLabelText('share anonymous usage analytics');
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);
    expect(setEnabled).toHaveBeenCalledWith(true);
  });
});
