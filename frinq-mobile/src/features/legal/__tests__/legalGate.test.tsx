import React from 'react';
import { StyleSheet } from 'react-native';
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

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | string | undefined>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ apiClient: fakeApiClient, authenticated: false });
  mockFetchCurrentLegal.mockResolvedValue({ terms_version: 'v2', privacy_version: 'v2' });
});

describe('LegalAcceptanceScreen — preauth mode', () => {
  it('uses the reference Accept action once current legal versions load', async () => {
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: jest.fn() }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    expect(getByRole('button', { name: 'Accept' }).props.accessibilityState.disabled).toBe(false);
  });

  it('keeps Accept available when the initial legal-version fetch fails', async () => {
    mockFetchCurrentLegal.mockRejectedValueOnce(new Error('network'));
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: jest.fn() }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    expect(getByRole('button', { name: 'Accept' }).props.accessibilityState.disabled).toBe(false);
  });

  it('continues preauth onboarding with the local legal version when the fetch remains unavailable', async () => {
    mockFetchCurrentLegal.mockRejectedValue(new Error('network'));
    const onContinue = jest.fn();
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue }} />,
    );
    fireEvent.press(getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(mockSavePendingAcceptance).toHaveBeenCalledWith({ termsVersion: 'draft-1', privacyVersion: 'draft-1', locale: 'en-IN' });
  });

  it('continues immediately when the legal check is still pending', async () => {
    mockFetchCurrentLegal.mockImplementation(() => new Promise(() => undefined));
    const onContinue = jest.fn();
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue }} />,
    );

    fireEvent.press(getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(mockSavePendingAcceptance).toHaveBeenCalledWith({ termsVersion: 'draft-1', privacyVersion: 'draft-1', locale: 'en-IN' });
  });

  it('shows the reference Accept action plus a "change or reject" link to view the privacy document', async () => {
    const { getByRole, queryByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: jest.fn() }} />,
    );
    expect(getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(queryByRole('link', { name: 'Terms of Service' })).toBeNull();
    fireEvent.press(getByRole('button', { name: 'change or reject' }));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'privacy' });
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
  });

  it('uses the reference privacy copy, palette, and the shared reference-journey button geometry', async () => {
    const { getByText, getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue: jest.fn() }} />,
    );

    expect(flatten(getByText('your privacy matters').props.style)).toMatchObject({ color: '#621407', fontSize: 32, lineHeight: 40 });
    expect(getByText('We store and process data from your device to provide features in the app and improve your experience')).toBeTruthy();
    expect(flatten(getByRole('button', { name: 'Accept' }).props.style)).toMatchObject({
      width: '76%', minHeight: 48, borderRadius: 12,
    });
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
  });

  it('saves a pending acceptance and hands off, without calling the API directly', async () => {
    const onContinue = jest.fn();
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'preauth', onContinue }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
    expect(mockSavePendingAcceptance).toHaveBeenCalledWith({ termsVersion: 'v2', privacyVersion: 'v2', locale: 'en-IN' });
    expect(mockAcceptLegal).not.toHaveBeenCalled();
  });
});

describe('LegalAcceptanceScreen — returning-user mode', () => {
  it('posts acceptance immediately and calls onAccepted on success', async () => {
    mockAcceptLegal.mockResolvedValue(true);
    const onAccepted = jest.fn();
    const { getByRole } = render(
      <LegalAcceptanceScreen mode={{ kind: 'returning', onAccepted }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByRole('button', { name: 'Accept' }));

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
    const { getByRole, findByText } = render(
      <LegalAcceptanceScreen mode={{ kind: 'returning', onAccepted }} />,
    );
    await waitFor(() => expect(mockFetchCurrentLegal).toHaveBeenCalled());
    fireEvent.press(getByRole('button', { name: 'Accept' }));

    await findByText("Couldn't save, try again");
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
