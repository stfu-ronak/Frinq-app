import { BASE_DELAYS_MS, classifyTicketError, closeCodeOutcome, delayForAttempt } from '../realtimeMachine';

describe('delayForAttempt', () => {
  it('uses the exact base delay progression 1/2/4/8/16/30s capped, full jitter in [0, base)', () => {
    const random = () => 0.999999;
    expect(delayForAttempt(0, random)).toBeCloseTo(BASE_DELAYS_MS[0], 0);
    expect(delayForAttempt(1, random)).toBeCloseTo(BASE_DELAYS_MS[1], 0);
    expect(delayForAttempt(2, random)).toBeCloseTo(BASE_DELAYS_MS[2], 0);
    expect(delayForAttempt(3, random)).toBeCloseTo(BASE_DELAYS_MS[3], 0);
    expect(delayForAttempt(4, random)).toBeCloseTo(BASE_DELAYS_MS[4], 0);
    expect(delayForAttempt(5, random)).toBeCloseTo(BASE_DELAYS_MS[5], 0);
    expect(delayForAttempt(99, random)).toBeCloseTo(BASE_DELAYS_MS[5], 0); // capped at 30s
  });

  it('is a full jitter (can be as low as 0)', () => {
    expect(delayForAttempt(0, () => 0)).toBe(0);
  });

  it('defaults to Math.random when no generator is injected', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(delayForAttempt(0)).toBeCloseTo(500, 0);
    spy.mockRestore();
  });
});

describe('closeCodeOutcome', () => {
  it('classifies the forbidden close code (ban/suspend control event) as banned', () => {
    expect(closeCodeOutcome(4403)).toBe('banned');
  });

  it('classifies every other close code — including invalid-ticket and malformed-frame — as retry', () => {
    expect(closeCodeOutcome(4401)).toBe('retry');
    expect(closeCodeOutcome(4400)).toBe('retry');
    expect(closeCodeOutcome(1000)).toBe('retry');
    expect(closeCodeOutcome(1006)).toBe('retry');
  });
});

describe('classifyTicketError', () => {
  it('classifies a 401 (refresh already failed once inside apiClient) as authExpired', () => {
    expect(classifyTicketError(401, 'http_401')).toBe('authExpired');
  });

  it('classifies a 403 with account_suspended as suspended', () => {
    expect(classifyTicketError(403, 'account_suspended')).toBe('suspended');
  });

  it('classifies a 403 with account_banned as banned', () => {
    expect(classifyTicketError(403, 'account_banned')).toBe('banned');
  });

  it('classifies a bare 403 with no recognized code as retry (never a silent terminal state)', () => {
    expect(classifyTicketError(403, 'http_403')).toBe('retry');
  });

  it('classifies rate-limit/unavailable/server errors as retry', () => {
    expect(classifyTicketError(429, 'http_429')).toBe('retry');
    expect(classifyTicketError(503, 'http_503')).toBe('retry');
    expect(classifyTicketError(500, 'http_500')).toBe('retry');
  });
});
