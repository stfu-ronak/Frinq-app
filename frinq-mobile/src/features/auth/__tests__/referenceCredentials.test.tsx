import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NameScreen } from '../screens/NameScreen';
import { PhoneScreen } from '../screens/PhoneScreen';
import { OtpScreen } from '../screens/OtpScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  // Serves every screen here: OtpScreen reads `phone`, NameScreen (now a
  // post-OTP step) reads the verified-credential context.
  useRoute: () => ({ params: { phone: '9876543210', userId: 'user-1', priorSession: null } }),
}));

const mockSignalAuthenticated = jest.fn();
const mockFlushPendingQuizState = jest.fn().mockResolvedValue(undefined);
jest.mock('../../quiz/flushPendingQuizState', () => ({
  flushPendingQuizState: (...args: unknown[]) => mockFlushPendingQuizState(...args),
}));

const mockSavePendingQuizState = jest.fn();
jest.mock('../../quiz/pendingQuizState', () => ({
  savePendingQuizState: (...args: unknown[]) => mockSavePendingQuizState(...args),
}));

jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: { request: jest.fn() }, coordinator: { signalAuthenticated: mockSignalAuthenticated } }),
}));

jest.mock('../authService', () => ({
  sendOtp: jest.fn(),
}));

jest.mock('../../quiz/quizSyncService', () => ({
  startQuiz: jest.fn(),
}));

describe('reference credential pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavePendingQuizState.mockResolvedValue(undefined);
  });

  it('saves the name and completes sign-in — Name is the LAST pre-auth step now, not a stop on the way to Phone', async () => {
    const { getByPlaceholderText, getByLabelText } = render(<NameScreen />);
    fireEvent.changeText(getByPlaceholderText('your name'), 'Rhea');
    fireEvent.press(getByLabelText('Continue with name'));

    await waitFor(() => expect(mockSavePendingQuizState).toHaveBeenCalledWith({ name: 'Rhea' }));
    await waitFor(() => expect(mockSignalAuthenticated).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalledWith('Phone');
  });

  it('uses the reference Request OTP action', () => {
    const { getByRole } = render(<PhoneScreen />);
    expect(getByRole('button', { name: 'Request OTP' })).toBeTruthy();
  });

  it('uses the reference Confirm action for the OTP page', () => {
    const { getByRole } = render(<OtpScreen />);
    expect(getByRole('button', { name: 'Confirm' })).toBeTruthy();
  });

  it('uses the reference-scale verify heading and compact Confirm button', () => {
    const { getByTestId, getByRole } = render(<OtpScreen />);
    const heading = StyleSheet.flatten(getByTestId('otp-heading').props.style as never) as Record<string, number | string | undefined>;
    const confirm = StyleSheet.flatten(getByRole('button', { name: 'Confirm' }).props.style as never) as Record<string, number | string | undefined>;
    expect(heading).toMatchObject({ color: '#621407', fontSize: 28, lineHeight: 42 });
    expect(confirm).toMatchObject({ width: '76%', minHeight: 48, borderRadius: 12 });
  });
});
