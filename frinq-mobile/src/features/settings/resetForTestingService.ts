import { QueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../services/api/apiClient';
import { SessionCoordinator } from '../../services/session/SessionCoordinator';
import { clearLocalSessionState } from './localSessionCleanup';

/** One-tap wipe for repeat testing: quiz → summary → profile → tap → back to
 *  the very first screen with a clean account, ready to run the whole flow
 *  again. Calls POST /users/me/reset-for-testing (users.py) — the backend is
 *  the actual gate: it 404s for any account whose phone isn't in the
 *  server's TEST_PHONES list and 404s outright in production, so this
 *  button is harmless to leave visible in a hand-built review APK.
 *
 *  Reuses the exact local-teardown path logout and account deletion already
 *  share: token, cached query state, encrypted quiz-draft store, and the
 *  pending pre-auth state, all cleared and the store's encryption key
 *  shredded — so the next sign-in starts from a genuinely empty client, not
 *  just a server-side-empty account with stale local caches.
 *
 *  Returns false (never throws) when the server refused the reset — the
 *  caller decides how to surface that; local state is left untouched in
 *  that case since there is nothing to clear. */
export async function resetForTesting(
  apiClient: ApiClient,
  coordinator: SessionCoordinator,
  queryClient: QueryClient,
): Promise<boolean> {
  try {
    await apiClient.request({ path: '/api/v1/users/me/reset-for-testing', method: 'POST' });
  } catch {
    return false;
  }
  await clearLocalSessionState(coordinator, queryClient);
  return true;
}
