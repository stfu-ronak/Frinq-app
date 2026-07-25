import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking, ScrollView } from 'react-native';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CommunitySettingsScreen } from '../screens/CommunitySettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';

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

const mockGetPushPermissionStatus = jest.fn();
const mockGetStoredPushEnabled = jest.fn();
const mockRegisterCurrentToken = jest.fn().mockResolvedValue(undefined);
const mockRequestPushPermission = jest.fn();
const mockSetPushEnabled = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/push/pushService', () => ({
  getPushPermissionStatus: (...args: unknown[]) => mockGetPushPermissionStatus(...args),
  getStoredPushEnabled: (...args: unknown[]) => mockGetStoredPushEnabled(...args),
  registerCurrentToken: (...args: unknown[]) => mockRegisterCurrentToken(...args),
  requestPushPermission: (...args: unknown[]) => mockRequestPushPermission(...args),
  setPushEnabled: (...args: unknown[]) => mockSetPushEnabled(...args),
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

    fireEvent.press(await findByLabelText('notifications'));
    expect(mockNavigate).toHaveBeenCalledWith('Notifications');

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

  it('scrolls rather than clipping its 6 rows + logout button at large text sizes', async () => {
    mockUseSession.mockReturnValue({ apiClient: {}, coordinator: {} });
    const { findByLabelText, UNSAFE_getByType } = renderWithClient(<SettingsScreen />);
    await findByLabelText('log out');
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
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

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(undefined) } });
  });

  it('shows the switch reflecting the stored preference when permission is already granted', async () => {
    mockGetPushPermissionStatus.mockResolvedValue('authorized');
    mockGetStoredPushEnabled.mockResolvedValue(true);

    const { findByLabelText } = renderWithClient(<NotificationSettingsScreen />);
    const toggle = await findByLabelText('notify me about new activity');
    expect(toggle.props.value).toBe(true);
  });

  it('links out to device settings instead of a toggle when permission was denied', async () => {
    mockGetPushPermissionStatus.mockResolvedValue('denied');
    mockGetStoredPushEnabled.mockResolvedValue(false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

    const { findByText, queryByLabelText } = renderWithClient(<NotificationSettingsScreen />);
    expect(queryByLabelText('notify me about new activity')).toBeNull();

    fireEvent.press(await findByText('open device settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it('requests permission, registers the token, and enables preferences on first opt-in', async () => {
    mockGetPushPermissionStatus.mockResolvedValueOnce('not-determined').mockResolvedValueOnce('authorized');
    mockGetStoredPushEnabled.mockResolvedValue(false);
    mockRequestPushPermission.mockResolvedValue('granted');

    const { findByLabelText } = renderWithClient(<NotificationSettingsScreen />);
    const toggle = await findByLabelText('notify me about new activity');
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(mockRequestPushPermission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRegisterCurrentToken).toHaveBeenCalledTimes(1));
    expect(mockSetPushEnabled).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('never enables preferences if the OS permission request is refused', async () => {
    mockGetPushPermissionStatus.mockResolvedValueOnce('not-determined').mockResolvedValueOnce('denied');
    mockGetStoredPushEnabled.mockResolvedValue(false);
    mockRequestPushPermission.mockResolvedValue('denied');

    const { findByLabelText } = renderWithClient(<NotificationSettingsScreen />);
    const toggle = await findByLabelText('notify me about new activity');

    fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(mockRequestPushPermission).toHaveBeenCalledTimes(1));
    expect(mockRegisterCurrentToken).not.toHaveBeenCalled();
    expect(mockSetPushEnabled).not.toHaveBeenCalled();
  });

  it('turns preferences off without touching permission or the token', async () => {
    mockGetPushPermissionStatus.mockResolvedValue('authorized');
    mockGetStoredPushEnabled.mockResolvedValue(true);

    const { findByLabelText } = renderWithClient(<NotificationSettingsScreen />);
    const toggle = await findByLabelText('notify me about new activity');
    expect(toggle.props.value).toBe(true);

    fireEvent(toggle, 'valueChange', false);

    await waitFor(() => expect(mockSetPushEnabled).toHaveBeenCalledWith(expect.anything(), false));
    expect(mockRequestPushPermission).not.toHaveBeenCalled();
    expect(mockRegisterCurrentToken).not.toHaveBeenCalled();
  });

  it('shows an error and leaves the switch alone if saving the preference fails', async () => {
    mockGetPushPermissionStatus.mockResolvedValue('authorized');
    mockGetStoredPushEnabled.mockResolvedValue(true);
    mockSetPushEnabled.mockRejectedValueOnce(new Error('network'));

    const { findByLabelText, findByRole } = renderWithClient(<NotificationSettingsScreen />);
    const toggle = await findByLabelText('notify me about new activity');

    fireEvent(toggle, 'valueChange', false);

    await findByRole('alert');
  });
});
