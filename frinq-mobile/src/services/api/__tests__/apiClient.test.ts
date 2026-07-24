import { createApiClient, HttpResponse, SessionGate } from '../apiClient';
import { ApiError } from '../apiError';

function res(status: number, body: unknown = {}, requestId?: string): HttpResponse {
  return {
    status,
    headers: { get: (n: string) => (n.toLowerCase() === 'x-request-id' ? requestId ?? null : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function gate(token: string | null, refresh: () => Promise<boolean>): SessionGate {
  return { getAccessToken: () => token, refresh };
}

const BASE = 'https://api.test';

describe('createApiClient', () => {
  it('attaches the bearer token and returns JSON on 200', async () => {
    const calls: RequestInit[] = [];
    const transport = async (_url: string, init: RequestInit) => { calls.push(init); return res(200, { ok: true }); };
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    const out = await client.request<{ ok: boolean }>({ path: '/x' });
    expect(out).toEqual({ ok: true });
    expect((calls[0].headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('refreshes once on 401 then retries and succeeds', async () => {
    let n = 0;
    const refresh = jest.fn(async () => true);
    const transport = async () => { n++; return n === 1 ? res(401, { code: 'expired' }) : res(200, { ok: 1 }); };
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', refresh) });
    await expect(client.request({ path: '/x' })).resolves.toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(n).toBe(2);
  });

  it('does not retry a second 401 (refresh succeeded but still 401)', async () => {
    let n = 0;
    const transport = async () => { n++; return res(401, { code: 'nope' }); };
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    await expect(client.request({ path: '/x' })).rejects.toBeInstanceOf(ApiError);
    expect(n).toBe(2); // original + one retry, never a third
  });

  it('never refreshes on 403/404/422', async () => {
    for (const status of [403, 404, 422]) {
      const refresh = jest.fn(async () => true);
      const transport = async () => res(status, { code: 'x' });
      const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', refresh) });
      await expect(client.request({ path: '/x' })).rejects.toMatchObject({ status });
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it('does not retry when refresh fails', async () => {
    let n = 0;
    const transport = async () => { n++; return res(401, { code: 'expired' }); };
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => false) });
    await expect(client.request({ path: '/x' })).rejects.toBeInstanceOf(ApiError);
    expect(n).toBe(1); // no retry because refresh returned false
  });

  it('surfaces the request id and code without leaking the body', async () => {
    const transport = async () => res(500, { code: 'server_boom', secret: 'do-not-leak' }, 'req-9');
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({ status: 500, code: 'server_boom', requestId: 'req-9' });
  });

  it('extracts a stable code from a FastAPI/Pydantic 422 validation array', async () => {
    const transport = async () =>
      res(422, { detail: [{ loc: ['body', 'display_name'], msg: 'Value error, display_name_too_short', type: 'value_error' }] });
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({ status: 422, code: 'display_name_too_short' });
  });

  it('omits Authorization for unauthenticated requests', async () => {
    const calls: RequestInit[] = [];
    const transport = async (_u: string, init: RequestInit) => { calls.push(init); return res(200, {}); };
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    await client.request({ path: '/legal/current', auth: false });
    expect((calls[0].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('resolves (not rejects) on a 204 with no body, without calling json()', async () => {
    // POST /auth/logout returns 204 empty — json() on an empty body throws.
    const transport = async (): Promise<HttpResponse> => ({
      status: 204,
      headers: { get: () => null },
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
      text: async () => '',
    });
    const client = createApiClient({ baseUrl: BASE, transport, session: gate('tok', async () => true) });
    await expect(client.request({ path: '/auth/logout', method: 'POST' })).resolves.toBeUndefined();
  });
});
