import { SessionCoordinator, SecureCredentialStore } from '../SessionCoordinator';
import { HttpResponse } from '../../api/apiClient';

function fakeStore(initial: string | null = null): SecureCredentialStore & { token: string | null; saves: number; clears: number } {
  return {
    token: initial,
    saves: 0,
    clears: 0,
    async saveRefreshToken(t) { this.token = t; this.saves++; },
    async loadRefreshToken() { return this.token; },
    async clearRefreshToken() { this.token = null; this.clears++; },
  };
}

function res(status: number, body: unknown = {}): HttpResponse {
  return {
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const BASE = 'https://api.test';

describe('SessionCoordinator', () => {
  it('first boot with no stored token is unauthenticated (not offline)', async () => {
    const store = fakeStore(null);
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => res(200), store });
    expect(await sc.restoreSession()).toEqual({ authenticated: false, offline: false });
    expect(sc.getAccessToken()).toBeNull();
  });

  it('rotates and persists the new refresh token before returning', async () => {
    const store = fakeStore('r0');
    const transport = jest.fn(async () => res(200, { access_token: 'a1', refresh_token: 'r1' }));
    const sc = new SessionCoordinator({ baseUrl: BASE, transport, store });
    expect(await sc.restoreSession()).toEqual({ authenticated: true, offline: false });
    expect(sc.getAccessToken()).toBe('a1');
    expect(store.token).toBe('r1'); // rotation persisted
  });

  it('reports offline (not unauthenticated) when the network fails but a token is still stored', async () => {
    const store = fakeStore('r0');
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => { throw new Error('offline'); }, store });
    // Critical: a returning user launching offline must NOT be treated as
    // logged out — the token survived, so this is offline, not authRequired.
    expect(await sc.restoreSession()).toEqual({ authenticated: false, offline: true });
    expect(store.token).toBe('r0');
  });

  it('reports unauthenticated (not offline) when the refresh token is rejected', async () => {
    const store = fakeStore('r-bad');
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => res(401, { code: 'refresh_reused' }), store });
    // A server rejection clears the token, so restore reports a genuine
    // logout, not offline.
    expect(await sc.restoreSession()).toEqual({ authenticated: false, offline: false });
    expect(store.token).toBeNull();
  });

  it('shares ONE refresh across concurrent callers (single-flight)', async () => {
    const store = fakeStore('r0');
    let calls = 0;
    const transport = jest.fn(async () => {
      calls++;
      return res(200, { access_token: `a${calls}`, refresh_token: `r${calls}` });
    });
    const sc = new SessionCoordinator({ baseUrl: BASE, transport, store });
    const [a, b, c] = await Promise.all([sc.refresh(), sc.refresh(), sc.refresh()]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(calls).toBe(1); // only one network refresh for concurrent 401s
  });

  it('clears everything on a rejected/reused refresh token', async () => {
    const store = fakeStore('r-bad');
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => res(401, { code: 'refresh_reused' }), store });
    expect(await sc.refresh()).toBe(false);
    expect(store.token).toBeNull();
    expect(store.clears).toBe(1);
    expect(sc.getAccessToken()).toBeNull();
  });

  it('keeps the refresh token on a network failure (no wipe)', async () => {
    const store = fakeStore('r0');
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => { throw new Error('offline'); }, store });
    expect(await sc.refresh()).toBe(false);
    expect(store.token).toBe('r0'); // preserved
    expect(store.clears).toBe(0);
  });

  it('logout clears memory + secure storage and signals auth change', async () => {
    const store = fakeStore('r0');
    const changes: boolean[] = [];
    const sc = new SessionCoordinator({ baseUrl: BASE, transport: async () => res(200, { access_token: 'a', refresh_token: 'r' }), store, onAuthChange: (v) => changes.push(v) });
    await sc.setTokens({ access_token: 'a', refresh_token: 'r' });
    await sc.clear();
    expect(sc.getAccessToken()).toBeNull();
    expect(store.token).toBeNull();
    expect(changes).toEqual([true, false]);
  });
});
