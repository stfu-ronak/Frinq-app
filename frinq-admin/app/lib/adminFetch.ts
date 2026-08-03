const KEY_STORE = "frinq_admin_key";

/** Admin key persists only for the browser tab's session — never
 *  localStorage, so it doesn't survive a closed tab/browser restart. */
export function loadAdminKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(KEY_STORE) ?? "";
}
export function saveAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY_STORE, key);
}
export function clearAdminKey(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY_STORE);
}

// Centralizes the ~19 scattered `if (res.status === 401) logout()` call
// sites that used to live in every view. AdminShell wires this to its
// `logout` once the admin is authed (and clears it while unauthed/checking,
// so the pre-login key-verify probe doesn't trigger it). A 401 from ANY
// adminFetch call now logs out automatically, closing the 2 confirmed
// misses (AccountsView's literal "error 401" text, and page.tsx's
// delete/bulk-delete handlers that only checked 403) without needing a
// per-call check at all — callers can still inspect res.status themselves
// for local UI (e.g. an early return), they just no longer need to call
// logout() to make it stick.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

// De-dupes identical GETs (method+URL+key) into one shared request — fixes
// the confirmed double-fetch of /admin/analytics on cold load (once from
// AdminShell's key-verify, once from the dashboard's own load). These two
// calls fire sequentially a beat apart (verify() resolves and flips to
// "authed" before the dashboard even mounts), not concurrently, so a plain
// in-flight-only dedup wouldn't catch it — the entry is kept for a short TTL
// after the request settles instead of being dropped the instant it does.
// Not a general cache: nothing here is ever revalidated, so callers that
// need fresh data (a manual refresh) should bypass it — see `noCache` below.
const DEDUPE_TTL_MS = 2000;
const dedupeCache = new Map<string, Promise<Response>>();

/** Authenticated fetch for admin endpoints. Sends the admin key as a
 *  Bearer token in the Authorization header and the action password (if
 *  provided) in X-Action-Password — neither value ever appears in the
 *  URL, so it can't leak via browser history, server access logs, the
 *  Referer header, or screenshots.
 *
 *  GETs are de-duped for `DEDUPE_TTL_MS` (see `dedupeCache` above) unless
 *  `noCache` is set — pass that for explicit user-triggered refreshes. */
export async function adminFetch(
  url: string,
  opts: RequestInit & { noCache?: boolean } = {},
  auth: { key: string; pwd?: string } = { key: "" },
): Promise<Response> {
  const { noCache, ...fetchOpts } = opts;
  const headers = new Headers(fetchOpts.headers || {});
  if (auth.key) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.pwd) headers.set("X-Action-Password", auth.pwd);

  const method = (fetchOpts.method || "GET").toUpperCase();
  const dedupeKey = method === "GET" && !noCache ? `${url}::${auth.key}` : null;
  const run = async () => {
    const res = await fetch(url, { ...fetchOpts, headers });
    if (res.status === 401) unauthorizedHandler?.();
    return res;
  };

  if (!dedupeKey) return run();
  const existing = dedupeCache.get(dedupeKey);
  if (existing) return existing.then((res) => res.clone());
  const promise = run();
  dedupeCache.set(dedupeKey, promise);
  promise.then(
    () => setTimeout(() => dedupeCache.delete(dedupeKey), DEDUPE_TTL_MS),
    () => dedupeCache.delete(dedupeKey), // don't cache a rejected fetch
  );
  return promise.then((res) => res.clone());
}
