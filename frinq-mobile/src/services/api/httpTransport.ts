import { HttpResponse, HttpTransport } from './apiClient';

/** Adapts the global fetch Response to our minimal HttpResponse shape. */
export const fetchTransport: HttpTransport = async (url, init) => {
  const res = await fetch(url, init);
  const wrapped: HttpResponse = {
    status: res.status,
    headers: { get: (name) => res.headers.get(name) },
    json: () => res.json(),
    text: () => res.text(),
  };
  return wrapped;
};
