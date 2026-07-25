/**
 * Task 45 — the genuine cross-module gap for revoked sessions:
 * SessionCoordinator.test.ts already proves 'clears everything on a
 * rejected/reused refresh token' at the coordinator level. Never proven end
 * to end: a real app boot with a stored-but-rejected refresh token actually
 * lands on the real authRequired screen through the real
 * BootController/routeForUser chain, not just that the coordinator's own
 * internal state got wiped.
 */
import * as Keychain from 'react-native-keychain';
import { renderBootJourney, routedTransport, jsonResponse, REFRESH_TOKEN_KEYCHAIN_SERVICE } from '../../test/releaseFixtures';

jest.mock('../../services/push/pushService', () => ({}));

let mockCurrentTransport = routedTransport({});
jest.mock('../../services/api/httpTransport', () => ({
  fetchTransport: (url: string, init: unknown) => mockCurrentTransport(url, init as never),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_KEYCHAIN_SERVICE } as never);
});

describe('revoked/reused refresh token at boot', () => {
  it('a stored token the server rejects lands on the real sign-in screen, not a hung splash', async () => {
    await Keychain.setGenericPassword('refresh_token', 'reused-token', {
      service: REFRESH_TOKEN_KEYCHAIN_SERVICE,
    } as never);

    mockCurrentTransport = routedTransport({
      '/api/v1/auth/refresh': () => jsonResponse(401, { code: 'refresh_reused' }),
    });

    const { findByLabelText, queryByTestId } = renderBootJourney();

    // Real routeForUser(null, ...) -> authRequired -> real LandingScreen.
    expect(await findByLabelText('begin')).toBeTruthy();
    expect(queryByTestId('boot-splash')).toBeNull();
  });

  it('a stored token the server cannot be reached for stays on the offline retry screen, never the sign-in screen', async () => {
    await Keychain.setGenericPassword('refresh_token', 'still-good-token', {
      service: REFRESH_TOKEN_KEYCHAIN_SERVICE,
    } as never);

    mockCurrentTransport = () => {
      throw new Error('simulated network failure');
    };

    const { findByTestId, queryByLabelText } = renderBootJourney();

    expect(await findByTestId('screen-offline')).toBeTruthy();
    // The whole point of the offline/authRequired distinction: a surviving
    // token that just couldn't be confirmed must never look like a logout.
    expect(queryByLabelText('begin')).toBeNull();
  });
});
