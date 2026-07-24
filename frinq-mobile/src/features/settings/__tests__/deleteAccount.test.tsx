import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { ApiError } from '../../../services/api/apiError';

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

const mockClearLocalSessionState = jest.fn();
jest.mock('../localSessionCleanup', () => ({
  clearLocalSessionState: (...args: unknown[]) => mockClearLocalSessionState(...args),
}));

const mockTrack = jest.fn();
jest.mock('../../../services/telemetry/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DeleteAccountScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DeleteAccountScreen', () => {
  it('requests an OTP bound to the account\'s own stored phone — no phone field is ever sent', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true });
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator: {} });

    const { findByText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({ path: '/api/v1/auth/reverify/request', method: 'POST' }),
    );
    expect(await findByText(/enter the code/i)).toBeTruthy();
  });

  it('shows a mapped error for an incorrect code and lets the user retype', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: true }) // request otp
      .mockRejectedValueOnce(new ApiError(400, 'incorrect code'));
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator: {} });

    const { findByText, findByLabelText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));
    fireEvent.changeText(await findByLabelText(/enter the 6-digit verification code/i), '000000');

    expect(await findByText(/wrong code/i)).toBeTruthy();
  });

  it('shows a mapped error for an expired code', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new ApiError(410, 'code expired, request a new one'));
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator: {} });

    const { findByText, findByLabelText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));
    fireEvent.changeText(await findByLabelText(/enter the 6-digit verification code/i), '111111');

    expect(await findByText(/no longer valid/i)).toBeTruthy();
  });

  it('advances to typed confirmation once the code verifies, and gates delete on typing DELETE exactly', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ reauth_token: 'reauth-abc', expires_in: 300 });
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator: {} });

    const { findByText, findByLabelText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));
    fireEvent.changeText(await findByLabelText(/enter the 6-digit verification code/i), '123456');

    const deleteButton = await findByLabelText('delete my account');
    expect(deleteButton.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(await findByLabelText('type DELETE'), 'DELETE');
    await waitFor(() => expect(deleteButton.props.accessibilityState.disabled).toBe(false));
  });

  it('deletes the account, tracks the event, and clears all local session state', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ reauth_token: 'reauth-abc', expires_in: 300 })
      .mockResolvedValueOnce({ id: 'user-1', deleted_at: '2026-07-24T00:00:00Z' });
    const coordinator = {};
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator });

    const { findByText, findByLabelText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));
    fireEvent.changeText(await findByLabelText(/enter the 6-digit verification code/i), '123456');
    fireEvent.changeText(await findByLabelText('type DELETE'), 'DELETE');
    fireEvent.press(await findByText('delete my account'));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        path: '/api/v1/users/me',
        method: 'DELETE',
        body: { reauth_token: 'reauth-abc' },
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith('account_deleted');
    await waitFor(() => expect(mockClearLocalSessionState).toHaveBeenCalledWith(coordinator, expect.anything()));
  });

  it('on a delete failure, never retries with the same (already-consumed) token — sends the user back to request a fresh one', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ reauth_token: 'reauth-abc', expires_in: 300 })
      .mockRejectedValueOnce(new ApiError(401, 'reverification required'));
    mockUseSession.mockReturnValue({ apiClient: { request }, coordinator: {} });

    const { findByText, findByLabelText } = renderWithClient();
    fireEvent.press(await findByText('send verification code'));
    fireEvent.changeText(await findByLabelText(/enter the 6-digit verification code/i), '123456');
    fireEvent.changeText(await findByLabelText('type DELETE'), 'DELETE');
    fireEvent.press(await findByText('delete my account'));

    // Back to the start of the flow, not stuck retrying — a stale token can
    // never succeed a second time, so a fresh OTP is the only real recovery.
    expect(await findByText('send verification code')).toBeTruthy();
    expect(mockClearLocalSessionState).not.toHaveBeenCalled();
  });
});
