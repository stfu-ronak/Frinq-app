/**
 * Allowlisted, consent-gated, property-free product analytics. The event union
 * makes arbitrary event names impossible at the type boundary; the runtime set
 * mirrors the backend allowlist (app/api/v1/tracking.py) as defense in depth.
 *
 * Off by default. Nothing is sent until (a) consent is granted and (b) a
 * transport is configured (the ApiClient wires this in Task 29). No properties
 * are ever attached — no phone/message/quiz/voice/token data can ride along.
 */
export type AllowedEvent =
  | 'screen_view'
  | 'otp_requested'
  | 'otp_verified'
  | 'quiz_started'
  | 'quiz_completed'
  | 'result_viewed'
  | 'community_opened'
  | 'message_sent'
  | 'report_submitted'
  | 'block_created'
  | 'notification_opt_in'
  | 'account_deleted'
  | 'event_viewed'
  | 'event_registration_opened';

const ALLOWED: ReadonlySet<AllowedEvent> = new Set([
  'screen_view', 'otp_requested', 'otp_verified', 'quiz_started', 'quiz_completed',
  'result_viewed', 'community_opened', 'message_sent', 'report_submitted',
  'block_created', 'notification_opt_in', 'account_deleted', 'event_viewed',
  'event_registration_opened',
]);

export type AnalyticsTransport = (event: AllowedEvent) => void;

let consent = false;
let transport: AnalyticsTransport | null = null;
let firebaseTransport: AnalyticsTransport | null = null;

/** Wire the network transport (ApiClient POST /api/v1/track). */
export function configureAnalytics(t: AnalyticsTransport | null): void {
  transport = t;
}

/** Wire Firebase Analytics separately from the backend audit transport. */
export function configureFirebaseAnalytics(t: AnalyticsTransport | null): void {
  firebaseTransport = t;
}

export function setAnalyticsConsent(enabled: boolean): void {
  consent = enabled;
}

export function isAnalyticsEnabled(): boolean {
  return consent;
}

/** Emit an allowlisted event. No-op unless consent is granted, a transport is
 *  configured, and the event is on the allowlist. */
export function track(event: AllowedEvent): void {
  if (!consent) return;
  if (!ALLOWED.has(event)) return; // unreachable via types; guards JS callers
  try { transport?.(event); } catch { /* telemetry must never block product flow */ }
  try { firebaseTransport?.(event); } catch { /* telemetry must never block product flow */ }
}

/** Test/reset hook. */
export function __resetAnalytics(): void {
  consent = false;
  transport = null;
  firebaseTransport = null;
}
