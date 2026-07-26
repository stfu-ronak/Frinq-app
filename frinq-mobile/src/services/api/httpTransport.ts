import { HttpResponse, HttpTransport } from './apiClient';

/** RN's fetch has no default timeout: a request that neither responds nor
 *  errors (dead connection, black-hole proxy) leaves the promise pending
 *  forever, hanging whatever UI awaits it (spinner that never resolves).
 *  Abort after this long so the caller sees the same NetworkError it already
 *  handles for a dropped connection. Covers uploads too — a ≤120s voice clip
 *  is a small M4A, well within this on any working link. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Adapts the global fetch Response to our minimal HttpResponse shape. */
export const fetchTransport: HttpTransport = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const wrapped: HttpResponse = {
      status: res.status,
      headers: { get: (name) => res.headers.get(name) },
      json: () => res.json(),
      text: () => res.text(),
    };
    return wrapped;
  } finally {
    // Always clear — on success (stop the pending abort) and on abort/error
    // (the reject already propagates; apiClient.attempt turns it into a
    // NetworkError).
    clearTimeout(timer);
  }
};
