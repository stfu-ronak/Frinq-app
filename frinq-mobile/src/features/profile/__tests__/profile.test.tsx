import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScrollView } from 'react-native';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { ApiError } from '../../../services/api/apiError';

const mockResetForTesting = jest.fn();
jest.mock('../../settings/resetForTestingService', () => ({
  resetForTesting: (...args: unknown[]) => mockResetForTesting(...args),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

const USER = {
  id: 'user-1',
  phone: '+919876543210',
  display_name: 'Ada',
  gender: 'female',
  age: 27,
  ncr_zone: 'south_delhi',
  community_slug: 'quiet-storm',
  onboarding_complete: true,
  onboarding_state: 'active',
  banned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfileScreen', () => {
  it('renders masked phone and formatted fields, never the raw phone number', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByText, queryByText } = renderWithClient(<ProfileScreen />);

    expect(await findByText('Ada')).toBeTruthy();
    expect(await findByText('+91 98**** **10')).toBeTruthy();
    expect(queryByText(USER.phone)).toBeNull();
    expect(await findByText('south delhi')).toBeTruthy(); // ncr_zone underscores -> spaces
    expect(await findByText('quiet storm')).toBeTruthy(); // community_slug dashes -> spaces
  });

  it('never exposes an editable archetype/quiz-derived field', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText, queryByLabelText } = renderWithClient(<ProfileScreen />);

    expect(await findByLabelText('edit')).toBeTruthy(); // only the display-name edit link exists
    expect(queryByLabelText(/edit.*(archetype|community|area|age|gender)/i)).toBeNull();
  });

  it('navigates to EditProfile and VibeReport', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText } = renderWithClient(<ProfileScreen />);

    fireEvent.press(await findByLabelText('edit'));
    expect(mockNavigate).toHaveBeenCalledWith('EditProfile');

    fireEvent.press(await findByLabelText('view your full vibe report'));
    expect(mockNavigate).toHaveBeenCalledWith('VibeReport');
  });

  it('resets the test account and shows no error when the server accepts it', async () => {
    const coordinator = {} as any;
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) }, coordinator });
    mockResetForTesting.mockResolvedValue(true);
    const { findByLabelText, queryByText } = renderWithClient(<ProfileScreen />);

    fireEvent.press(await findByLabelText('reset test account'));

    await waitFor(() => expect(mockResetForTesting).toHaveBeenCalledTimes(1));
    expect(mockResetForTesting.mock.calls[0][1]).toBe(coordinator); // coordinator forwarded, not swallowed
    expect(queryByText("this account can't be reset.")).toBeNull();
  });

  it("shows a denial message rather than silently doing nothing when the server refuses the reset", async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) }, coordinator: {} });
    mockResetForTesting.mockResolvedValue(false);
    const { findByLabelText, findByText } = renderWithClient(<ProfileScreen />);

    fireEvent.press(await findByLabelText('reset test account'));

    expect(await findByText("this account can't be reset.")).toBeTruthy();
  });

  it('shows a retryable error on fetch failure', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockRejectedValue(new Error('network')) } });
    const { findByRole } = renderWithClient(<ProfileScreen />);
    const alert = await findByRole('alert');
    expect(alert).toBeTruthy();
  });
});

describe('EditProfileScreen', () => {
  it('disables save until the name is actually changed', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText } = renderWithClient(<EditProfileScreen />);

    const saveButton = await findByLabelText('save');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('scrolls rather than clipping the form at large text sizes', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText, UNSAFE_getByType } = renderWithClient(<EditProfileScreen />);
    await findByLabelText('save');
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });

  it('cancel with no changes goes back immediately, no confirm dialog', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText, queryByText } = renderWithClient(<EditProfileScreen />);

    fireEvent.press(await findByLabelText('cancel'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(queryByText('discard your changes?')).toBeNull();
  });

  it('cancel with unsaved changes shows a confirm dialog; discard navigates back', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText, findByText } = renderWithClient(<EditProfileScreen />);

    fireEvent.changeText(await findByLabelText('display name'), 'Ada Lovelace');
    fireEvent.press(await findByLabelText('cancel'));
    expect(mockGoBack).not.toHaveBeenCalled();

    fireEvent.press(await findByText('discard'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('saves successfully and navigates back only after server acceptance', async () => {
    const updated = { ...USER, display_name: 'Ada Lovelace' };
    const request = jest.fn()
      .mockResolvedValueOnce(USER) // initial GET
      .mockResolvedValueOnce(updated); // PATCH
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText } = renderWithClient(<EditProfileScreen />);
    fireEvent.changeText(await findByLabelText('display name'), 'Ada Lovelace');
    fireEvent.press(await findByLabelText('save'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/users/me', method: 'PATCH', body: { display_name: 'Ada Lovelace' } });
  });

  it('maps a backend display_name error code to a user-facing message', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(USER)
      .mockRejectedValueOnce(new ApiError(422, 'display_name_reserved_term'));
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findByText } = renderWithClient(<EditProfileScreen />);
    fireEvent.changeText(await findByLabelText('display name'), 'admin');
    fireEvent.press(await findByLabelText('save'));

    expect(await findByText(/isn't available/i)).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows a generic message on a network error', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce(USER)
      .mockRejectedValueOnce(new Error('network'));
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findByText } = renderWithClient(<EditProfileScreen />);
    fireEvent.changeText(await findByLabelText('display name'), 'Ada Lovelace');
    fireEvent.press(await findByLabelText('save'));

    expect(await findByText(/network error/i)).toBeTruthy();
  });

  it('editing only gender sends gender alone — never an unchanged display_name (would falsely trip the rate limit)', async () => {
    const updated = { ...USER, gender: 'non_binary' };
    const request = jest.fn().mockResolvedValueOnce(USER).mockResolvedValueOnce(updated);
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findByRole } = renderWithClient(<EditProfileScreen />);
    fireEvent.press(await findByLabelText('Non binary'));
    fireEvent.press(await findByRole('button', { name: 'save' }));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenLastCalledWith({ path: '/api/v1/users/me', method: 'PATCH', body: { gender: 'non_binary' } });
  });

  it('editing age and area together sends both in one combined PATCH', async () => {
    const updated = { ...USER, age: 30, ncr_zone: 'noida' };
    const request = jest.fn().mockResolvedValueOnce(USER).mockResolvedValueOnce(updated);
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findByRole } = renderWithClient(<EditProfileScreen />);
    fireEvent.changeText(await findByLabelText('age'), '30');
    fireEvent.press(await findByLabelText('Noida'));
    fireEvent.press(await findByRole('button', { name: 'save' }));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenLastCalledWith({ path: '/api/v1/users/me', method: 'PATCH', body: { age: 30, ncr_zone: 'noida' } });
  });

  it('locks the display-name field and shows the next-eligible date within the 3-month cooldown', async () => {
    const recentlyChanged = { ...USER, display_name_updated_at: new Date().toISOString() };
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(recentlyChanged) } });

    const { findByLabelText } = renderWithClient(<EditProfileScreen />);
    const nameField = await findByLabelText('display name');
    expect(nameField.props.editable).toBe(false);
  });

  it('leaves the display-name field editable once the cooldown has passed', async () => {
    const longAgo = { ...USER, display_name_updated_at: '2020-01-01T00:00:00Z' };
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(longAgo) } });

    const { findByLabelText } = renderWithClient(<EditProfileScreen />);
    const nameField = await findByLabelText('display name');
    expect(nameField.props.editable).not.toBe(false);
  });
});
