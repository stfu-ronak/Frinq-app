"use client";

import { apiUrl, getAccessToken, restoreSession } from "./session";

export { apiUrl };

let refreshPromise: Promise<boolean> | null = null;

/** Concurrent 401s share this single in-flight refresh — only one
 * POST /api/v1/auth/refresh ever goes out at a time. */
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = restoreSession()
      .then((state) => state.authenticated)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // FormData (voice upload) must keep its own multipart boundary — never
  // set Content-Type ourselves for it.
  const isJsonBody = init.body != null && !(init.body instanceof FormData);
  if (isJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/**
 * fetch() wrapper that adds the current access token, and on exactly one
 * 401 response, refreshes the session and retries once. Never retries a
 * second 401, or any other status (403/404/422/etc).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = () => fetch(apiUrl(path), { ...init, headers: buildHeaders(init) });

  const response = await attempt();
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshOnce();
  if (!refreshed) {
    return response;
  }
  return attempt();
}
