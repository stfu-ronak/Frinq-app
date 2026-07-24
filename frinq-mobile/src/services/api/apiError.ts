/**
 * Safe API error. Carries only a status, a stable machine code, and the
 * server request id — NEVER the response body, tokens, phone, or any content.
 * String coercion is deliberately safe for logs/crash reports.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, requestId?: string) {
    super(`api_error:${status}:${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** 403/404/422 and other client errors must never trigger a refresh+retry. */
export function isNonRetryableClientError(status: number): boolean {
  return status === 403 || status === 404 || status === 422 || (status >= 400 && status < 500 && status !== 401);
}

export class NetworkError extends Error {
  constructor() {
    super('network_error');
    this.name = 'NetworkError';
  }
}
