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

/** Authenticated fetch for admin endpoints. Sends the admin key as a
 *  Bearer token in the Authorization header and the action password (if
 *  provided) in X-Action-Password — neither value ever appears in the
 *  URL, so it can't leak via browser history, server access logs, the
 *  Referer header, or screenshots. */
export async function adminFetch(
  url: string,
  opts: RequestInit = {},
  auth: { key: string; pwd?: string } = { key: "" },
): Promise<Response> {
  const headers = new Headers(opts.headers || {});
  if (auth.key) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.pwd) headers.set("X-Action-Password", auth.pwd);
  return fetch(url, { ...opts, headers });
}
