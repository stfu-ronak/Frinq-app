import { HttpTransport } from '../api/apiClient';
import { RefreshResponse, TokenPair } from '../api/contracts';

/** Secure refresh-token store (Keychain/Keystore adapter injected). Access
 *  tokens are NEVER persisted here — they live only in coordinator memory. */
export interface SecureCredentialStore {
  saveRefreshToken(token: string): Promise<void>;
  loadRefreshToken(): Promise<string | null>;
  clearRefreshToken(): Promise<void>;
}

export interface BootSession {
  authenticated: boolean;
  /** True when the session couldn't be confirmed due to no connectivity, but
   *  a refresh token is still stored (i.e. NOT logged out). Callers route
   *  this to an offline/retry state, never to the login screen. */
  offline: boolean;
}

export interface SessionCoordinatorConfig {
  baseUrl: string;
  transport: HttpTransport;
  store: SecureCredentialStore;
  /** Called after any successful token set/rotation and on clear (for wiring
   *  analytics identity, realtime teardown, etc.). Never receives raw tokens. */
  onAuthChange?: (authenticated: boolean) => void;
}

/**
 * Owns the in-memory access token, the secure refresh token, token rotation,
 * a single shared refresh promise for concurrent 401s, and terminal auth
 * failure. Refresh-token rotation is persisted BEFORE the original request is
 * retried. Reuse/failure clears everything.
 */
export class SessionCoordinator {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private readonly cfg: SessionCoordinatorConfig;

  constructor(cfg: SessionCoordinatorConfig) {
    this.cfg = cfg;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Set tokens after OTP verify. Persists the refresh token first.
   *
   *  `signalAuthChange: false` sets the credential WITHOUT firing the
   *  auth-change callback yet — the caller (OtpScreen) uses this so it can
   *  finish writing pre-auth pending state (flushed legal acceptance +
   *  quiz draft) BEFORE boot re-resolution mounts the quiz navigator and
   *  reads that draft. Without the deferral the boot flip races the flush
   *  and the quiz can resume from the wrong step, dropping the typed name.
   *  Call signalAuthenticated() once the flush is done. */
  async setTokens(pair: TokenPair, opts: { signalAuthChange?: boolean } = {}): Promise<void> {
    await this.cfg.store.saveRefreshToken(pair.refresh_token);
    this.accessToken = pair.access_token;
    if (opts.signalAuthChange !== false) this.cfg.onAuthChange?.(true);
  }

  /** Fire the auth-change signal explicitly — pairs with
   *  setTokens(..., { signalAuthChange: false }). */
  signalAuthenticated(): void {
    this.cfg.onAuthChange?.(true);
  }

  /** Boot restoration: exchange the stored refresh token for a fresh pair.
   *  Distinguishes three outcomes so the caller can route correctly:
   *   - authenticated: refresh succeeded.
   *   - offline: refresh failed but a refresh token is still stored — doRefresh
   *     keeps the token on a network failure and only clears it on an actual
   *     server rejection, so a surviving token means "couldn't reach the
   *     server", not "logged out".
   *   - neither: no/last-rejected credential → genuinely unauthenticated. */
  async restoreSession(): Promise<BootSession> {
    const ok = await this.refresh();
    if (ok) return { authenticated: true, offline: false };
    const tokenSurvived = (await this.cfg.store.loadRefreshToken()) !== null;
    return { authenticated: false, offline: tokenSurvived };
  }

  /**
   * Coordinated refresh. Concurrent callers share ONE in-flight request. The
   * new refresh token is persisted before resolving true, so a retried request
   * never races an unpersisted rotation.
   */
  refresh(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.cfg.store.loadRefreshToken();
    if (!refreshToken) {
      this.accessToken = null;
      return false;
    }
    let res;
    try {
      res = await this.cfg.transport(`${this.cfg.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Network failure: keep the refresh token (may still be valid), report
      // unauthenticated for this attempt without wiping the session.
      this.accessToken = null;
      return false;
    }

    if (res.status < 200 || res.status >= 300) {
      // Rejected / reused / expired refresh token -> terminal: clear everything.
      await this.clear();
      return false;
    }

    const data = (await res.json()) as RefreshResponse;
    // Persist rotation BEFORE anyone retries with the new access token.
    await this.cfg.store.saveRefreshToken(data.refresh_token);
    this.accessToken = data.access_token;
    this.cfg.onAuthChange?.(true);
    return true;
  }

  /** Logout / ban / deletion / reuse: drop memory + secure storage. */
  async clear(): Promise<void> {
    this.accessToken = null;
    await this.cfg.store.clearRefreshToken();
    this.cfg.onAuthChange?.(false);
  }
}
