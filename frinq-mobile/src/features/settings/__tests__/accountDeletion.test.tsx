/**
 * Task 45 — the genuine cross-module gap: deleteAccount.test.tsx already
 * proves DeleteAccountScreen calls clearLocalSessionState with the real
 * coordinator; localSessionCleanup.test.ts already proves that function calls
 * coordinator.clear(); SessionCoordinator.test.ts already proves clear() flips
 * onAuthChange(false). Never proven end to end: does that flip actually reach
 * BootController and re-resolve to authRequired through the REAL routeForUser
 * — not an injected resolver? This wires the real SessionProvider/
 * BootController/routeForUser against a fake HTTP transport to close that
 * loop. The confirm -> otp -> type-DELETE UI flow itself is already fully
 * covered in deleteAccount.test.tsx and is not repeated here.
 */
import { act } from '@testing-library/react-native';
import * as Keychain from 'react-native-keychain';
import {
  renderBootJourney,
  routedTransport,
  jsonResponse,
  REFRESH_TOKEN_KEYCHAIN_SERVICE,
} from '../../../test/releaseFixtures';

jest.mock('../../../services/push/pushService', () => ({}));

let mockCurrentTransport = routedTransport({});
jest.mock('../../../services/api/httpTransport', () => ({
  fetchTransport: (url: string, init: unknown) => mockCurrentTransport(url, init as never),
}));

const LEGAL = { terms_version: 'draft-1', privacy_version: 'draft-1' };

const SUSPENDED_USER = {
  id: 'user-1',
  onboarding_complete: true,
  onboarding_state: 'active',
  banned: false,
  suspended: true,
  terms_version: 'draft-1',
  privacy_version: 'draft-1',
  community_slug: 'quiet-storm',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_KEYCHAIN_SERVICE } as never);
});

describe('post-deletion boot resolution (real SessionCoordinator + real routeForUser)', () => {
  it('re-resolves all the way to the sign-in screen once the account is cleared — not stuck on the prior screen, not a splash', async () => {
    await Keychain.setGenericPassword('refresh_token', 'stored-refresh-1', {
      service: REFRESH_TOKEN_KEYCHAIN_SERVICE,
    } as never);

    mockCurrentTransport = routedTransport({
      '/api/v1/auth/refresh': () => jsonResponse(200, { access_token: 'access-1', refresh_token: 'refresh-2' }),
      '/api/v1/users/me': () => jsonResponse(200, SUSPENDED_USER),
      '/api/v1/legal/current': () => jsonResponse(200, LEGAL),
    });

    const { findByTestId, findByLabelText, getCoordinator } = renderBootJourney();

    // Precondition: this really is an authenticated session that resolved
    // past authRequired, through the real refresh + users/me + routeForUser.
    await findByTestId('screen-suspended');

    // The exact call account deletion's cleanup makes first
    // (localSessionCleanup.ts's clearLocalSessionState -> coordinator.clear()).
    await act(async () => {
      await getCoordinator().clear();
    });

    // Boot re-resolved with no stored credential at all -> authRequired ->
    // the real LandingScreen action, not a stale suspended screen and not
    // a splash stuck on "checking".
    expect(await findByLabelText('Start finding your Frinq')).toBeTruthy();
  });
});
