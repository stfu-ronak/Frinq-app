const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Stored<T> {
  value: T;
  ts: number;
}

/**
 * Dev-mode flag. Set via `?dev=1` URL param on any page. Persists in
 * localStorage so the user doesn't need to re-add it on every visit.
 * Clear via `?dev=0`. Independent of NEXT_PUBLIC_DEV_PHONE env var,
 * which can't be relied on (build-time inlining quirks).
 */
const DEV_FLAG_KEY = "frinq_dev_mode";

export function syncDevFlagFromURL(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const dev = params.get("dev");
  if (dev === "1") localStorage.setItem(DEV_FLAG_KEY, "1");
  else if (dev === "0") localStorage.removeItem(DEV_FLAG_KEY);
}

export function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEV_FLAG_KEY) === "1";
}

export function getQuizState<T = string>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw) as Stored<T>;
    if (Date.now() - ts > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function setQuizState<T = string>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() } satisfies Stored<T>));
  } catch { /* storage full — best effort */ }
}

/**
 * Keys we never wipe even on dev-mode resets. The user's name comes from
 * the /name page which runs BEFORE /phone (where dev-mode clears state),
 * and we want it to carry forward into /city ("where do you live, Ronak?").
 * Phone is the identifier we just confirmed, so keeping it is obvious.
 * Identity mirrors both for the tracking layer + Clarity tagging.
 */
const PRESERVED_KEYS = new Set([
  "frinq_name",
  "frinq_phone",
  "frinq_identity",
  "frinq_dev_mode",
]);

export function clearQuizState(): void {
  if (typeof window === "undefined") return;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("frinq_") && !PRESERVED_KEYS.has(k)) toDelete.push(k);
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}

/** Hard reset — wipe absolutely everything including identity. Use only
 *  when the user explicitly clicks "start over" on splash. */
export function hardResetQuizState(): void {
  if (typeof window === "undefined") return;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("frinq_")) toDelete.push(k);
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}
