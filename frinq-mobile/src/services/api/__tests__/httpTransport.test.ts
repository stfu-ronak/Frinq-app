import { fetchTransport } from '../httpTransport';

describe('fetchTransport', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  it('wraps a successful response and passes a non-aborted signal', async () => {
    let receivedInit: RequestInit | undefined;
    globalThis.fetch = jest.fn(async (_url: unknown, init: RequestInit) => {
      receivedInit = init;
      return {
        status: 200,
        headers: { get: () => 'req-1' },
        json: async () => ({ ok: true }),
        text: async () => 'ok',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await fetchTransport('http://x/api', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('req-1');
    // A timeout signal is attached and, on success, never fired.
    expect((receivedInit?.signal as AbortSignal).aborted).toBe(false);
  });

  it('aborts (rejects) when fetch never settles before the timeout', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    globalThis.fetch = jest.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    const pending = fetchTransport('http://x/api', {});
    jest.advanceTimersByTime(30_000);

    await expect(pending).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });
});
