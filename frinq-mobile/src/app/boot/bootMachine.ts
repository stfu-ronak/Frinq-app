/**
 * Pure boot routing. Given the server-authoritative user + current legal
 * versions, decide the single top-level route. The app NEVER derives this from
 * a persisted "complete" flag — always from server state.
 */
export type BootState =
  | 'checking'
  | 'authRequired'
  | 'legalRequired'
  | 'quizInProgress'
  | 'processing'
  | 'active'
  | 'error'
  // No connectivity at boot while a session credential is still stored — we
  // can't confirm the session, but the user is NOT logged out. Distinct from
  // authRequired (genuinely no/rejected credential) so an offline launch
  // shows a retry, never the phone-entry screen. Auto-retries on reconnect.
  | 'offline'
  | 'suspended'
  | 'banned';

export interface BootUser {
  onboarding_state?: string | null;
  terms_version?: string | null;
  privacy_version?: string | null;
  community_slug?: string | null;
  suspended?: boolean;
  banned?: boolean;
}

export interface CurrentLegal {
  terms_version: string;
  privacy_version: string;
}

/**
 * Precedence (safety first):
 *   1. no user/credential           -> authRequired
 *   2. banned / suspended           -> terminal support screen
 *   3. stale legal acceptance       -> legalRequired
 *   4. onboarding_state             -> active | processing | error | quizInProgress
 */
export function routeForUser(user: BootUser | null, legal: CurrentLegal): BootState {
  if (!user) return 'authRequired';
  if (user.banned) return 'banned';
  if (user.suspended) return 'suspended';

  const legalStale =
    user.terms_version !== legal.terms_version || user.privacy_version !== legal.privacy_version;
  if (legalStale) return 'legalRequired';

  switch (user.onboarding_state) {
    case 'active':
      return 'active';
    case 'profile_processing':
      return 'processing';
    case 'error':
      return 'error';
    default:
      // quiz_in_progress, null, or any unknown/legacy value
      return 'quizInProgress';
  }
}

/** States that render authenticated/protected content and must never appear
 *  before boot resolves (while state === 'checking'). */
export function isProtectedState(state: BootState): boolean {
  return state === 'active' || state === 'processing' || state === 'quizInProgress';
}

/** A push/deep link only enters its destination once the user is fully active;
 *  otherwise boot/session/legal/membership gating decides the route first. */
export function canHandleDeepLink(state: BootState): boolean {
  return state === 'active';
}
