/**
 * Task 46 Step 4 — plants representative secrets and real user content and
 * proves the crash reporter strips or drops them before they'd reach the
 * backend (recordError/log), not just that a blocklist exists in source.
 */
import {
  configureCrashReporter,
  logBreadcrumb,
  reportHandledError,
  scrubText,
  __resetCrashReporter,
  CrashBackend,
} from '../crashReporter';

let recorded: Array<{ error: Error; context?: Record<string, string | number | boolean> }>;
let logged: string[];

function fakeBackend(): CrashBackend {
  return {
    log: (message: string) => logged.push(message),
    recordError: (error: Error, context?: Record<string, string | number | boolean>) => {
      recorded.push({ error, context });
    },
  };
}

beforeEach(() => {
  recorded = [];
  logged = [];
  __resetCrashReporter();
  configureCrashReporter(fakeBackend());
});

describe('allowlisted fields pass through unmodified', () => {
  it('sends every Step-4-allowlisted field with a safe value', () => {
    reportHandledError('render_error', {
      requestId: 'req-123',
      screenIdentifier: 'CommunityScreen',
      lifecycleState: 'foreground',
      networkClass: 'wifi',
      appVersion: '1.4.0',
      buildNumber: '42',
      osFamily: 'android',
      deviceClass: 'phone-mid-tier',
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].context).toEqual({
      code: 'render_error',
      requestId: 'req-123',
      screenIdentifier: 'CommunityScreen',
      lifecycleState: 'foreground',
      networkClass: 'wifi',
      appVersion: '1.4.0',
      buildNumber: '42',
      osFamily: 'android',
      deviceClass: 'phone-mid-tier',
    });
  });

  it('no-ops without throwing when no backend is configured', () => {
    __resetCrashReporter();
    expect(() => reportHandledError('x')).not.toThrow();
    expect(() => logBreadcrumb('y')).not.toThrow();
  });
});

describe('forbidden-key fields are dropped entirely, regardless of value', () => {
  it.each([
    ['phone', '+919876543210'],
    ['refreshToken', 'r-abc123'],
    ['accessToken', 'a-abc123'],
    ['pushToken', 'fcm-device-xyz'],
    ['otpCode', '482913'],
    ['messageBody', 'hey are you free tonight?'],
    ['reportReason', 'harassment details here'],
    ['voicePath', 'file:///cache/clip-9876.m4a'],
    ['quizAnswers', 'likes long walks and jazz'],
    ['userAnswer', 'my darkest secret'],
    ['userName', 'Priya Sharma'],
    ['email', 'priya@example.com'],
    ['profileBio', 'a whole paragraph of self-description'],
    ['communityPost', 'the actual chat content'],
    ['requestBody', '{"secret":"stuff"}'],
    ['responseBody', '{"secret":"stuff"}'],
  ])('drops planted "%s" field entirely', (key, plantedValue) => {
    reportHandledError('some_code', { [key]: plantedValue } as never);
    const context = recorded[0].context ?? {};
    expect(context[key]).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain(plantedValue);
  });
});

describe('value-pattern scrub — content that leaks into a field NOT named for it', () => {
  it('strips a phone number embedded in the error code itself', () => {
    reportHandledError('invalid phone +919876543210 supplied');
    expect(recorded[0].error.message).not.toContain('9876543210');
    expect(recorded[0].context?.code).not.toContain('9876543210');
  });

  it('strips a bearer token embedded in the error code', () => {
    reportHandledError('outbound call failed: Bearer sk-live-abcdefghijklmnop');
    expect(recorded[0].context?.code).not.toContain('abcdefghijklmnop');
  });

  it('strips a JWT-shaped string embedded in the error code', () => {
    const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123signature';
    reportHandledError(`session error, token was ${jwtLike}`);
    expect(recorded[0].context?.code).not.toContain(jwtLike);
  });

  it('strips a phone number that leaked into an allowlisted free-text field', () => {
    // screenIdentifier is supposed to be a route name — this plants what a
    // careless call site might accidentally pass instead.
    reportHandledError('nav_error', { screenIdentifier: 'CommunityScreen?phone=9876543210' });
    expect(recorded[0].context?.screenIdentifier).not.toContain('9876543210');
    expect(recorded[0].context?.screenIdentifier).toBeDefined(); // key survives, only the value is scrubbed
  });

  it('logBreadcrumb scrubs planted phone/token content too, not just reportHandledError', () => {
    logBreadcrumb('user tapped call button for +919876543210');
    expect(logged[0]).not.toContain('9876543210');
  });
});

describe('scrubText (unit-level, the shared primitive)', () => {
  it('masks Indian phone numbers with or without a country-code prefix', () => {
    expect(scrubText('call 9876543210 now')).not.toContain('9876543210');
    expect(scrubText('call +919876543210 now')).not.toContain('9876543210');
    expect(scrubText('call 919876543210 now')).not.toContain('9876543210');
  });

  it('leaves ordinary safe text untouched', () => {
    expect(scrubText('CommunityScreen')).toBe('CommunityScreen');
    expect(scrubText('render_error')).toBe('render_error');
  });
});
