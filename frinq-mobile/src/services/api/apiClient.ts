import { ApiError, NetworkError } from './apiError';

/** Minimal fetch-shaped transport so the client is testable without a network. */
export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type HttpTransport = (url: string, init: RequestInit) => Promise<HttpResponse>;

/** The session surface the client needs: the current in-memory access token and
 *  a coordinated single-flight refresh. Implemented by SessionCoordinator. */
export interface SessionGate {
  getAccessToken(): string | null;
  refresh(): Promise<boolean>;
}

export interface ApiRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** A FormData body is sent as multipart, no Content-Type header (RN's
   *  fetch sets the boundary itself); anything else is JSON-encoded. */
  body?: unknown | FormData;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

export interface ApiClientConfig {
  baseUrl: string;
  transport: HttpTransport;
  session: SessionGate;
}

async function safeCode(res: HttpResponse): Promise<string> {
  // Read a stable code WITHOUT leaking arbitrary body content into errors.
  try {
    const data = (await res.json()) as
      | { code?: string; detail?: string | Array<{ msg?: string }> }
      | null;
    if (data && typeof data.code === 'string') return data.code;
    if (data && typeof data.detail === 'string') return data.detail.slice(0, 64);
    // FastAPI's 422 body shape is `detail: [{msg, loc, type}, ...]` — our own
    // Pydantic field validators raise `ValueError("some_stable_code")`, which
    // Pydantic v2 formats as "Value error, some_stable_code". Strip that
    // prefix so a validator-raised code round-trips as cleanly as the plain-
    // string case above (still bounded, still never arbitrary body content).
    const firstMsg = Array.isArray(data?.detail) ? data.detail[0]?.msg : undefined;
    if (typeof firstMsg === 'string') return firstMsg.replace(/^Value error,\s*/, '').slice(0, 64);
  } catch {
    /* non-JSON body — ignore */
  }
  return `http_${res.status}`;
}

export function createApiClient({ baseUrl, transport, session }: ApiClientConfig) {
  async function attempt(req: ApiRequest): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    const useAuth = req.auth !== false;
    const token = useAuth ? session.getAccessToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    const isMultipart = typeof FormData !== 'undefined' && req.body instanceof FormData;
    if (req.body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';

    let res: HttpResponse;
    try {
      res = await transport(`${baseUrl}${req.path}`, {
        method: req.method ?? 'GET',
        headers,
        body: req.body === undefined ? undefined : isMultipart ? (req.body as FormData) : JSON.stringify(req.body),
      });
    } catch {
      throw new NetworkError();
    }
    return res;
  }

  async function request<T>(req: ApiRequest): Promise<T> {
    let res = await attempt(req);

    // Exactly one refresh+retry on a first 401 (auth requests only).
    if (res.status === 401 && req.auth !== false) {
      const refreshed = await session.refresh();
      if (refreshed) {
        res = await attempt(req);
      }
    }

    if (res.status >= 200 && res.status < 300) {
      // 204 (e.g. POST /auth/logout) has no body — calling res.json() on an
      // empty body throws. Return undefined for any empty/no-content success
      // so callers awaiting a bodyless 2xx don't spuriously reject.
      if (res.status === 204) return undefined as T;
      try {
        return (await res.json()) as T;
      } catch {
        return undefined as T;
      }
    }

    // Every non-2xx is a safe ApiError; nothing here is retryable (the single
    // refresh+retry already happened above). 4xx/5xx are treated identically.
    throw new ApiError(res.status, await safeCode(res), res.headers.get('x-request-id') ?? undefined);
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;
