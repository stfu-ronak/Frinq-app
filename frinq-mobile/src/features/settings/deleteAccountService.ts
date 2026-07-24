import { ApiClient } from '../../services/api/apiClient';
import { ReauthTokenResponse, UserDeleteResponse } from '../../services/api/contracts';

/** POST /api/v1/auth/reverify/request — OTP to the account's own stored
 *  phone only, never a phone the client supplies. */
export async function requestDeletionOtp(apiClient: ApiClient): Promise<void> {
  await apiClient.request({ path: '/api/v1/auth/reverify/request', method: 'POST' });
}

/** POST /api/v1/auth/reverify/verify — returns a single-use, 5-minute,
 *  account_delete-only token. */
export async function verifyDeletionOtp(apiClient: ApiClient, code: string): Promise<ReauthTokenResponse> {
  return apiClient.request<ReauthTokenResponse>({
    path: '/api/v1/auth/reverify/verify',
    method: 'POST',
    body: { code },
  });
}

/** DELETE /api/v1/users/me. The reauth token is consumed server-side the
 *  instant this call is received — BEFORE the deletion transaction even
 *  starts — so a failure here (network error, transient 5xx) can never be
 *  retried with the same token; the caller must request a fresh OTP. */
export async function deleteAccount(apiClient: ApiClient, reauthToken: string): Promise<UserDeleteResponse> {
  return apiClient.request<UserDeleteResponse>({
    path: '/api/v1/users/me',
    method: 'DELETE',
    body: { reauth_token: reauthToken },
  });
}

/** Maps the real backend error codes (auth.py's reverify endpoints) to
 *  user-facing copy. */
export function mapReverifyError(code: string): string {
  switch (code) {
    case 'incorrect code':
      return 'Wrong code — check your WhatsApp and retype.';
    case 'code expired, request a new one':
      return "That code is no longer valid — request a new one.";
    case 'too many attempts':
    case 'too many requests':
      return 'Too many attempts — wait a moment and try again.';
    case 'verification took too long, try again':
      return 'Verification is taking too long. Try again.';
    case 'no phone on file for this account':
      return "We don't have a phone number on file for this account — contact support.";
    default:
      return "Couldn't verify, try again.";
  }
}
