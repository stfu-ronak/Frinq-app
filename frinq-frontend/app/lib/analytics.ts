"use client";

import { apiUrl } from "@/app/lib/session";

const CONSENT_KEY = "frinq.analytics_consent";

// Fixed allowlist — mirrors app/api/v1/tracking.py's ALLOWED_EVENTS, checked
// again server-side as defense in depth. Never phone/message-text/voice/
// quiz-free-text/names/tokens/tickets/IP/user-agent.
export type AnalyticsEvent =
  | "screen_view"
  | "otp_requested"
  | "otp_verified"
  | "quiz_started"
  | "quiz_completed"
  | "result_viewed"
  | "community_opened"
  | "message_sent"
  | "report_submitted"
  | "block_created"
  | "notification_opt_in"
  | "account_deleted";

const ALLOWED_EVENTS = new Set<AnalyticsEvent>([
  "screen_view", "otp_requested", "otp_verified", "quiz_started",
  "quiz_completed", "result_viewed", "community_opened", "message_sent",
  "report_submitted", "block_created", "notification_opt_in", "account_deleted",
]);

function getSessionId(): string {
  let s = sessionStorage.getItem("frinq_session");
  if (!s) {
    s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("frinq_session", s);
  }
  return s;
}

/** Off by default. Only "1" counts as opted in — anything else (unset,
 * "0", dismissed) means analytics stays off. */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) === "1";
}

export function hasAnalyticsDecision(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) !== null;
}

export function setAnalyticsEnabled(enabled: boolean): void {
  localStorage.setItem(CONSENT_KEY, enabled ? "1" : "0");
}

/** Every allowlisted event is deliberately property-free — session_id/page/
 * action only. No free-form properties, so there's nowhere for free-text or
 * PII to hide (mirrors app/api/v1/tracking.py's TrackPayload). */
export function track(event: AnalyticsEvent): void {
  if (!isAnalyticsEnabled()) return;
  if (!ALLOWED_EVENTS.has(event)) return;
  fetch(apiUrl("/api/v1/track"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: getSessionId(),
      page: window.location.pathname,
      action: event,
    }),
    keepalive: true,
  }).catch(() => {});
}
