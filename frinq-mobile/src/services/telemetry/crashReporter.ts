/**
 * Redacted operational crash reporting. Backend-agnostic: a Crashlytics
 * backend is injected in a later task once the owner's Firebase config exists
 * (Firebase Analytics stays OFF; automatic screen/content capture disabled;
 * session replay never added). Default backend is a no-op.
 *
 * NEVER attach phone, tokens, quiz/message/report text, voice paths, or push
 * tokens. Only safe error codes + request IDs are allowed through, and custom
 * keys are scrubbed here regardless of what a caller passes.
 */
export interface CrashBackend {
  log(message: string): void;
  recordError(error: Error, context?: Record<string, string | number | boolean>): void;
}

/** Keys that must never be sent even if a caller includes them. */
// Note: "otp" covers verification codes; a plain "code" key is the safe error
// code and is allowed through.
const FORBIDDEN_KEYS = /phone|token|otp|message|report|voice|quiz|answer|name|email|push/i;

let backend: CrashBackend | null = null;

export function configureCrashReporter(b: CrashBackend | null): void {
  backend = b;
}

function scrub(context?: Record<string, unknown>): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  if (!context) return safe;
  for (const [k, v] of Object.entries(context)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
  }
  return safe;
}

/** Report a handled error with only safe fields (code + optional requestId). */
export function reportHandledError(code: string, meta?: { requestId?: string }): void {
  if (!backend) return;
  const context = scrub({ code, ...(meta?.requestId ? { requestId: meta.requestId } : {}) });
  backend.recordError(new Error(code), context);
}

export function logBreadcrumb(message: string): void {
  backend?.log(message);
}

export function __resetCrashReporter(): void {
  backend = null;
}
