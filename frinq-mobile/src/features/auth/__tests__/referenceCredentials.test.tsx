import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NameScreen } from '../screens/NameScreen';
import { PhoneScreen } from '../screens/PhoneScreen';
import { OtpScreen } from '../screens/OtpScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: { phone: '9876543210' } }),
}));

const mockSavePendingQuizState = jest.fn();
jest.mock('../../quiz/pendingQuizState', () => ({
  savePendingQuizState: (...args: unknown[]) => mockSavePendingQuizState(...args),
}));

jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: { request: jest.fn() } }),
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

  it('saves the name before opening the reference phone screen', async () => {
    const { getByPlaceholderText, getByLabelText } = render(<NameScreen />);
    fireEvent.changeText(getByPlaceholderText('your name'), 'Rhea');
    fireEvent.press(getByLabelText('Continue with name'));

    await waitFor(() => expect(mockSavePendingQuizState).toHaveBeenCalledWith({ name: 'Rhea' }));
    expect(mockNavigate).toHaveBeenCalledWith('Phone');
  });

  it('uses the reference Request OTP action', () => {
    const { getByRole } = render(<PhoneScreen />);
    expect(getByRole('button', { name: 'Request OTP' })).toBeTruthy();
  });

  it('uses the reference Confirm action for the OTP page', () => {
    const { getByRole } = render(<OtpScreen />);
    expect(getByRole('button', { name: 'Confirm' })).toBeTruthy();
  });
});
