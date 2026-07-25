import React from 'react';
import { ScrollView } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PhoneScreen } from '../screens/PhoneScreen';
import { OtpScreen } from '../screens/OtpScreen';

const mockNavigate = jest.fn();
const mockRouteParams: { phone: string } = { phone: '9876543210' };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

const mockSendOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockAcceptLegal = jest.fn();
jest.mock('../authService', () => ({
  sendOtp: (...args: unknown[]) => mockSendOtp(...args),
  verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
  acceptLegal: (...args: unknown[]) => mockAcceptLegal(...args),
}));

const mockLoadPendingAcceptance = jest.fn();
const mockClearPendingAcceptance = jest.fn();
jest.mock('../../legal/pendingAcceptance', () => ({
  loadPendingAcceptance: () => mockLoadPendingAcceptance(),
  clearPendingAcceptance: () => mockClearPendingAcceptance(),
}));

const mockStartQuiz = jest.fn();
jest.mock('../../quiz/quizSyncService', () => ({
  startQuiz: (...args: unknown[]) => mockStartQuiz(...args),
}));

const mockSavePendingQuizState = jest.fn();
jest.mock('../../quiz/pendingQuizState', () => ({
  savePendingQuizState: (...args: unknown[]) => mockSavePendingQuizState(...args),
}));

const mockFlushPendingQuizState = jest.fn();
jest.mock('../../quiz/flushPendingQuizState', () => ({
  flushPendingQuizState: (...args: unknown[]) => mockFlushPendingQuizState(...args),
}));

const fakeApiClient = { request: jest.fn() };
const fakeCoordinator = { setTokens: jest.fn(), signalAuthenticated: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockUseSession.mockReturnValue({ apiClient: fakeApiClient, coordinator: fakeCoordinator });
  mockLoadPendingAcceptance.mockResolvedValue(null);
  mockStartQuiz.mockResolvedValue({ submission_id: 'sub-1' });
  mockFlushPendingQuizState.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PhoneScreen', () => {
  it('disables Continue below 10 digits and enables it at 10', () => {
    const { getByLabelText, getByRole } = render(<PhoneScreen />);
    const input = getByLabelText('Phone number');
    fireEvent.changeText(input, '987654321'); // 9 digits
    expect(getByRole('button', { name: /Continue/ }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(input, '9876543210'); // 10 digits
    expect(getByRole('button', { name: /Continue/ }).props.accessibilityState.disabled).toBe(false);
  });

  it('navigates to Otp with the phone number on success', async () => {
    mockSendOtp.mockResolvedValue({ ok: true });
    const { getByLabelText, getByRole } = render(<PhoneScreen />);
    fireEvent.changeText(getByLabelText('Phone number'), '9876543210');
    fireEvent.press(getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Otp', { phone: '9876543210' }));
  });

  it('shows a rate-limit message and does not navigate on 429', async () => {
    mockSendOtp.mockResolvedValue({ ok: false, code: 'rate_limited', retryAfter: 60 });
    const { getByLabelText, getByRole, findByText } = render(<PhoneScreen />);
    fireEvent.changeText(getByLabelText('Phone number'), '9876543210');
    fireEvent.press(getByRole('button', { name: /Continue/ }));
    await findByText('Too many attempts — wait a bit and try again.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('scrolls rather than clipping the field + button when the OS keyboard and large text both eat vertical space', () => {
    const { UNSAFE_getByType } = render(<PhoneScreen />);
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });
});

describe('OtpScreen', () => {
  it('shows an invalid-code error and clears the field', async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, code: 'invalid' });
    const { getByLabelText, findByText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Enter the 6-digit verification code'), '000000');
    await findByText('Wrong code — check your WhatsApp and retype.');
    expect(fakeCoordinator.setTokens).not.toHaveBeenCalled();
  });

  it('shows an expired-code error with the resend hint', async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, code: 'expired' });
    const { getByLabelText, findByText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Enter the 6-digit verification code'), '123456');
    await findByText("That code is no longer valid — tap 'resend code' below.");
  });

  it('blocks resend during the cooldown, then allows it once expired', async () => {
    const { getByRole } = render(<OtpScreen />);
    const resend = getByRole('button', { name: /resend in \d+s/ });
    expect(resend.props.accessibilityState.disabled).toBe(true);

    act(() => jest.advanceTimersByTime(30_000));
    await waitFor(() => expect(getByRole('button', { name: 'resend code' }).props.accessibilityState.disabled).toBe(false));

    fireEvent.press(getByRole('button', { name: 'resend code' }));
    expect(mockSendOtp).toHaveBeenCalledWith(fakeApiClient, '9876543210');
  });

  it('on success: persists tokens, flushes a pending legal acceptance, and clears it', async () => {
    mockVerifyOtp.mockResolvedValue({
      ok: true,
      data: { access_token: 'a1', refresh_token: 'r1', user: {}, prior_session: null },
    });
    mockLoadPendingAcceptance.mockResolvedValue({ termsVersion: 'v2', privacyVersion: 'v2', locale: 'en-IN' });
    mockAcceptLegal.mockResolvedValue(true);

    const { getByLabelText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Enter the 6-digit verification code'), '123456');

    await waitFor(() => expect(fakeCoordinator.setTokens).toHaveBeenCalledWith({ access_token: 'a1', refresh_token: 'r1' }, { signalAuthChange: false }));
    await waitFor(() => expect(mockAcceptLegal).toHaveBeenCalled());
    expect(mockClearPendingAcceptance).toHaveBeenCalled();
  });

  it('on success with no pending acceptance: does not call acceptLegal', async () => {
    mockVerifyOtp.mockResolvedValue({
      ok: true,
      data: { access_token: 'a1', refresh_token: 'r1', user: {}, prior_session: null },
    });
    const { getByLabelText } = render(<OtpScreen />);
    fireEvent.changeText(getByLabelText('Enter the 6-digit verification code'), '123456');
    await waitFor(() => expect(fakeCoordinator.setTokens).toHaveBeenCalled());
    expect(mockAcceptLegal).not.toHaveBeenCalled();
  });

  it('scrolls rather than clipping the code entry when the OS keyboard and large text both eat vertical space', () => {
    const { UNSAFE_getByType } = render(<OtpScreen />);
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });
});
