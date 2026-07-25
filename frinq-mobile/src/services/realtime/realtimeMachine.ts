/**
 * Pure decision logic for the community realtime connection — no socket, no
 * timers, no React Native APIs. Kept separate from CommunitySocket.ts so the
 * backoff/classification rules are unit-testable without any I/O mocking.
 * Ported from frinq-frontend/app/lib/realtime.ts (web equivalent, Task 21).
 */

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'retrying'
  | 'offline'
  | 'authExpired'
  | 'suspended'
  | 'banned';

/** Exponential backoff bases in ms, by attempt (capped at the last entry). */
export const BASE_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
/** A connection must stay "connected" this long before the attempt counter
 *  resets — a connect-then-immediately-drop loop must not reset backoff. */
export const STABLE_CONNECTION_MS = 5000;
/** How long a background app may hold the socket open before it's closed.
 *  ponytail: no plan-specified number — 30s survives a quick app-switch or
 *  notification check without idling a live socket indefinitely; revisit if
 *  real usage shows it's too short/long. */
export const BACKGROUND_GRACE_MS = 30000;

/** Full jitter: uniform in [0, base). `random` is injectable for deterministic tests. */
export function delayForAttempt(attempt: number, random: () => number = Math.random): number {
  const base = BASE_DELAYS_MS[Math.min(attempt, BASE_DELAYS_MS.length - 1)];
  return random() * base;
}

/** Backend WS close codes (app/core/realtime.py) that must never trigger a
 *  reconnect — a live control event (ban/suspend), not a transient drop. */
const CLOSE_FORBIDDEN = 4403;

export function closeCodeOutcome(code: number): 'banned' | 'retry' {
  return code === CLOSE_FORBIDDEN ? 'banned' : 'retry';
}

/** Classifies a failed ws-ticket fetch (ApiError status + code) into the
 *  resulting connection state. `retry` covers 429/503/5xx/anything else —
 *  transient, worth another attempt with backoff. */
export function classifyTicketError(status: number, code: string): 'authExpired' | 'suspended' | 'banned' | 'retry' {
  if (status === 401) return 'authExpired';
  if (status === 403 && code === 'account_suspended') return 'suspended';
  if (status === 403 && code === 'account_banned') return 'banned';
  return 'retry';
}
