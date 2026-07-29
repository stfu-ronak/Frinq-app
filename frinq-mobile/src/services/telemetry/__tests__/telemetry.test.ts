import {
  track,
  setAnalyticsConsent,
  configureAnalytics,
  configureFirebaseAnalytics,
  isAnalyticsEnabled,
  __resetAnalytics,
  AllowedEvent,
} from '../analytics';
import {
  reportHandledError,
  configureCrashReporter,
  CrashBackend,
  __resetCrashReporter,
} from '../crashReporter';

afterEach(() => {
  __resetAnalytics();
  __resetCrashReporter();
});

describe('analytics consent gate', () => {
  it('is off by default and sends nothing', () => {
    const sent: AllowedEvent[] = [];
    configureAnalytics((e) => sent.push(e));
    expect(isAnalyticsEnabled()).toBe(false);
    track('screen_view');
    expect(sent).toEqual([]);
  });

  it('sends only after consent and stops immediately when revoked', () => {
    const sent: AllowedEvent[] = [];
    configureAnalytics((e) => sent.push(e));
    setAnalyticsConsent(true);
    track('community_opened');
    expect(sent).toEqual(['community_opened']);
    setAnalyticsConsent(false);
    track('message_sent');
    expect(sent).toEqual(['community_opened']);
  });

  it('does not send when no transport is configured', () => {
    setAnalyticsConsent(true);
    expect(() => track('otp_verified')).not.toThrow();
  });

  it('sends one allowlisted event to backend and Firebase after consent', () => {
    const backend: AllowedEvent[] = [];
    const firebase: AllowedEvent[] = [];
    configureAnalytics((event) => backend.push(event));
    configureFirebaseAnalytics((event) => firebase.push(event));
    setAnalyticsConsent(true);

    track('quiz_completed');

    expect(backend).toEqual(['quiz_completed']);
    expect(firebase).toEqual(['quiz_completed']);
  });
});

describe('crash reporter redaction', () => {
  it('scrubs forbidden keys and only forwards safe context', () => {
    const calls: Array<{ error: Error; context?: Record<string, unknown> }> = [];
    const backend: CrashBackend = {
      log: () => {},
      recordError: (error, context) => calls.push({ error, context }),
    };
    configureCrashReporter(backend);

    // Callers can't inject PII: reportHandledError only exposes code + requestId.
    reportHandledError('ws_auth_expired', { requestId: 'req-123' });
    expect(calls).toHaveLength(1);
    expect(calls[0].context).toEqual({ code: 'ws_auth_expired', requestId: 'req-123' });
  });

  it('is a no-op when no backend configured (Firebase deferred)', () => {
    expect(() => reportHandledError('x')).not.toThrow();
  });
});
