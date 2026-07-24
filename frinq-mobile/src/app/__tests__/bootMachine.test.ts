import { routeForUser, isProtectedState, canHandleDeepLink, BootUser, CurrentLegal } from '../boot/bootMachine';

const LEGAL: CurrentLegal = { terms_version: 'v2', privacy_version: 'v2' };
const accepted = { terms_version: 'v2', privacy_version: 'v2' };

function user(overrides: Partial<BootUser> = {}): BootUser {
  return { onboarding_state: 'active', ...accepted, community_slug: 'seeker', ...overrides };
}

describe('routeForUser', () => {
  it('no credential/user -> authRequired', () => {
    expect(routeForUser(null, LEGAL)).toBe('authRequired');
  });

  it('banned and suspended take precedence over everything', () => {
    expect(routeForUser(user({ banned: true }), LEGAL)).toBe('banned');
    expect(routeForUser(user({ suspended: true }), LEGAL)).toBe('suspended');
    // even a banned user with stale legal is routed to banned, not legal
    expect(routeForUser(user({ banned: true, terms_version: 'v1' }), LEGAL)).toBe('banned');
  });

  it('stale terms OR privacy -> legalRequired', () => {
    expect(routeForUser(user({ terms_version: 'v1' }), LEGAL)).toBe('legalRequired');
    expect(routeForUser(user({ privacy_version: 'v1' }), LEGAL)).toBe('legalRequired');
  });

  it('maps each onboarding_state', () => {
    expect(routeForUser(user({ onboarding_state: 'active' }), LEGAL)).toBe('active');
    expect(routeForUser(user({ onboarding_state: 'profile_processing' }), LEGAL)).toBe('processing');
    expect(routeForUser(user({ onboarding_state: 'error' }), LEGAL)).toBe('error');
    expect(routeForUser(user({ onboarding_state: 'quiz_in_progress' }), LEGAL)).toBe('quizInProgress');
  });

  it('unknown/legacy onboarding_state falls back to quizInProgress', () => {
    expect(routeForUser(user({ onboarding_state: 'something_new' }), LEGAL)).toBe('quizInProgress');
    expect(routeForUser(user({ onboarding_state: null }), LEGAL)).toBe('quizInProgress');
  });

  it('active with missing membership is still active (Community tab handles it)', () => {
    expect(routeForUser(user({ onboarding_state: 'active', community_slug: null }), LEGAL)).toBe('active');
  });
});

describe('isProtectedState', () => {
  it('protects post-auth states only', () => {
    expect(isProtectedState('active')).toBe(true);
    expect(isProtectedState('processing')).toBe(true);
    expect(isProtectedState('quizInProgress')).toBe(true);
    for (const s of ['checking', 'authRequired', 'legalRequired', 'suspended', 'banned', 'error'] as const) {
      expect(isProtectedState(s)).toBe(false);
    }
  });
});

describe('canHandleDeepLink', () => {
  it('only handles deep links once active (waits out boot/legal/membership)', () => {
    expect(canHandleDeepLink('active')).toBe(true);
    for (const s of ['checking', 'authRequired', 'legalRequired', 'processing', 'quizInProgress', 'suspended', 'banned', 'error'] as const) {
      expect(canHandleDeepLink(s)).toBe(false);
    }
  });
});
