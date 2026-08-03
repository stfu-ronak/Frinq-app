import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LegalHubScreen } from '../screens/LegalHubScreen';
import { SupportScreen } from '../screens/SupportScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LegalHubScreen', () => {
  const USER = {
    id: 'user-1',
    terms_accepted_at: '2026-01-15T00:00:00Z',
    privacy_accepted_at: '2026-01-15T00:00:00Z',
  };

  it('shows acceptance dates for terms/privacy but not for community rules', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findAllByText, queryAllByText } = renderWithClient(<LegalHubScreen />);

    expect(await findAllByText(/accepted/i)).toHaveLength(2); // terms + privacy only
    expect(queryAllByText('Frinq Squad Rules')).toHaveLength(1); // rendered, just no acceptance line
  });

  it('navigates in-app for "view" and opens the real site for "read online"', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
    const { findByLabelText } = renderWithClient(<LegalHubScreen />);

    fireEvent.press(await findByLabelText('view Terms of Service in app'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'terms' });

    fireEvent.press(await findByLabelText('read Terms of Service online'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://frinq.in/terms'));
  });
});

describe('SupportScreen', () => {
  it('opens a mailto link for the support email', async () => {
    const { findByLabelText } = render(<SupportScreen />);
    fireEvent.press(await findByLabelText('support@frinq.in'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('mailto:support@frinq.in'));
  });

  it('links to account deletion and each legal document', async () => {
    const { findByText } = render(<SupportScreen />);

    fireEvent.press(await findByText('account deletion'));
    expect(mockNavigate).toHaveBeenCalledWith('Account');

    fireEvent.press(await findByText('terms'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'terms' });

    fireEvent.press(await findByText('privacy policy'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'privacy' });

    fireEvent.press(await findByText('frinq squad rules'));
    expect(mockNavigate).toHaveBeenCalledWith('LegalDocument', { doc: 'community-rules' });
  });
});
