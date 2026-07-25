/**
 * Redacted operational crash reporting. Backend-agnostic: a Crashlytics
 * backend is injected in a later task once the owner's Firebase config exists
 * (Firebase Analytics stays OFF; automatic screen/content capture disabled;
 * session replay never added). Default backend is a no-op.
 *
 * Task 46 Step 4's exact allowlist: app/build/OS/device class, screen
 * identifier, lifecycle state, network class, and an allowlisted error code
 * MAY be sent. Phone numbers, tokens, push tokens, quiz answers, voice paths/
 * audio, message/report text, profile content, community content, and raw
 * request/response bodies must NEVER be sent.
 *
 * Two independent layers, since either alone misses real cases:
 *  1. Key-based blocklist — a caller literally naming a field "phone"/
 *     "message"/"token" etc is dropped regardless of its value.
 *  2. Value-pattern scrub — applied to EVERY string value, including the
 *     error code itself and the allowlisted free-text-ish fields
 *     (screenIdentifier, deviceClass, ...). A field that's "safe by
 *     construction" (e.g. a route name) can still leak if a caller's error
 *     code/name happens to interpolate real content — this is the backstop.
 */
export interface CrashBackend {
  log(message: string): void;
  recordError(error: Error, context?: Record<string, string | number | boolean>): void;
}

/** Keys that must never be sent even if a caller includes them. */
// Note: "otp" covers verification codes; a plain "code" key is the safe error
// code and is allowed through (its VALUE still goes through scrubText below).
const FORBIDDEN_KEYS = /phone|token|otp|message|report|voice|quiz|answer|name|email|push|profile|community|body/i;

const _VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_.]+/g,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT-shaped
  /(?<!\d)\+?(?:91)?[6-9]\d{9}(?!\d)/g, // Indian phone, +91/91/bare
];

const _MASK = '[redacted]';

/** Applied to every string value before it can leave this module — the
 * defense-in-depth backstop for content that leaked into a field that isn't
 * named for it (e.g. a phone number embedded in an error message used as the
 * "code"). */
export function scrubText(value: string): string {
  let out = value;
  for (const pattern of _VALUE_PATTERNS) out = out.replace(pattern, _MASK);
  return out;
}

let backend: CrashBackend | null = null;

export function configureCrashReporter(b: CrashBackend | null): void {
  backend = b;
}

function scrub(context?: Record<string, unknown>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  if (!context) return safe;
  for (const [k, v] of Object.entries(context)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (typeof v === 'string') safe[k] = scrubText(v);
    else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
  }
  return safe;
}

/** The full allowlisted device/app context Step 4 names. Every field is
 * optional — callers attach only what they actually have. */
export interface CrashMeta {
  requestId?: string;
  /** Route/screen name only — e.g. "CommunityScreen", never a param value. */
  screenIdentifier?: string;
  /** e.g. "foreground" | "background" | "inactive". */
  lifecycleState?: string;
  /** e.g. "wifi" | "cellular" | "offline" — never signal strength/carrier. */
  networkClass?: string;
  appVersion?: string;
  buildNumber?: string;
  osFamily?: string;
  osVersion?: string;
  /** A performance/form-factor TIER (e.g. "phone-mid-tier") — never the raw
   * device model string, which can be a fingerprinting vector. */
  deviceClass?: string;
}

/** Report a handled error with only allowlisted fields — every string value
 * (including `code` itself) is scrubbed before it can reach the backend. */
export function reportHandledError(code: string, meta?: CrashMeta): void {
  if (!backend) return;
  const safeCode = scrubText(code);
  const context = scrub({ code: safeCode, ...meta });
  backend.recordError(new Error(safeCode), context);
}

export function logBreadcrumb(message: string): void {
  backend?.log(scrubText(message));
}

export function __resetCrashReporter(): void {
  backend = null;
}
