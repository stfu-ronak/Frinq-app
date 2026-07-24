import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LegalAcceptanceScreen } from '../screens/LegalAcceptanceScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

const mockFetchCurrentLegal = jest.fn();
const mockAcceptLegal = jest.fn();
jest.mock('../../auth/authService', () => ({
  fetchCurrentLegal: (...args: unknown[]) => mockFetchCurrentLegal(...args),
  acceptLegal: (...args: unknown[]) => mockAcceptLegal(...args),
}));

const mockSavePendingAcceptance = jest.fn();
jest.mock('../pendingAcceptance', () => ({
  savePendingAcceptance: (...args: unknown[]) => mockSavePendingAcceptance(...args),
}));

const fakeApiClient = { request: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ apiClient: fakeApiClient, authenticated: false });
  mockFetchCurrentLegal.mockResolvedValue({ terms_version: 'v2', privacy_version: 'v2' });
});

describe('LegalAcceptanceScreen — preauth mode', () => {
  it('disables Continue until both checkboxes are checked and versions have loaded', async () => {
    const onContinue = jest.fn();
    const { getByRole, getByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());

    const continueBtn = getByRole('button', { name: 'Continue' });
    expect(continueBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByText('I confirm I am 18 years of age or older.'));
    expect(continueBtn.props.accessibilityState.disabled).toBe(true); // still needs the second checkbox

    fireEvent(getByRole('link', { name: 'Terms of Service' }), 'press'); // sanity: link is reachable, doesn't toggle checkbox
    fireEvent.press(getByRole('checkbox', { name: /agree to the/i }));
    await waitFor(() => expect(continueBtn.props.accessibilityState.disabled).toBe(false));
  });

  it('stays disabled if fetching current legal versions fails', async () => {
    mockFetchCurrentLegal.mockRejectedValueOnce(new Error('network'));
    const { getByRole, getByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: jest.fn() }} />,
    );
    fireEvent.press(getByText('I confirm I am 18 years of age or older.'));
    fireEvent.press(getByRole('checkbox', { name: /agree to the/i }));
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    expect(getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
  });

  it('saves a pending acceptance and hands off, without calling the API directly', async () => {
    const onContinue = jest.fn();
    const { getByRole, getByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByText('I confirm I am 18 years of age or older.'));
    fireEvent.press(getByRole('checkbox', { name: /agree to the/i }));
    fireEvent.press(getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(mockSavePendingAcceptance).toHaveBeenCalledWith({ termsVersion: 'v2', privacyVersion: 'v2', locale: 'en-IN' });
    expect(mockAcceptLegal).not.toHaveBeenCalled();
  });
});

describe('LegalAcceptanceScreen — returning-user mode', () => {
  it('posts acceptance immediately and calls onAccepted on success', async () => {
    mockAcceptLegal.mockResolvedValue(true);
    const onAccepted = jest.fn();
    const { getByRole, getByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'returning', onAccepted }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByText('I confirm I am 18 years of age or older.'));
    fireEvent.press(getByRole('checkbox', { name: /agree to the/i }));
    fireEvent.press(getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    // Platform.OS resolves to 'ios' under the RN Jest preset by default.
    expect(mockAcceptLegal).toHaveBeenCalledWith(fakeApiClient, {
      terms_version: 'v2',
      privacy_version: 'v2',
      locale: 'en-IN',
      source: 'ios',
    });
  });

  it('shows an error and does NOT call onAccepted when the server rejects it', async () => {
    mockAcceptLegal.mockResolvedValue(false);
    const onAccepted = jest.fn();
    const { getByRole, getByText, findByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'returning', onAccepted }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByText('I confirm I am 18 years of age or older.'));
    fireEvent.press(getByRole('checkbox', { name: /agree to the/i }));
    fireEvent.press(getByRole('button', { name: 'Continue' }));

    await findByText("Couldn't save, try again");
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
