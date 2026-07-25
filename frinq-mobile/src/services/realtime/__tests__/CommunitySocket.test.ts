import { CommunitySocket } from '../CommunitySocket';
import { ApiError } from '../../api/apiError';
import { BASE_DELAYS_MS, STABLE_CONNECTION_MS } from '../realtimeMachine';

type NetInfoListener = (state: { isConnected: boolean; isInternetReachable: boolean }) => void;
let netInfoListener: NetInfoListener | null = null;
const mockNetInfoUnsub = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((cb: NetInfoListener) => {
    netInfoListener = cb;
    return mockNetInfoUnsub;
  }),
}));

type PhaseListener = (phase: 'active' | 'background') => void;
let phaseListener: PhaseListener | null = null;
const mockPhaseUnsub = jest.fn();
jest.mock('../../lifecycle/appLifecycle', () => ({
  onAppPhase: jest.fn((cb: PhaseListener) => {
    phaseListener = cb;
    return mockPhaseUnsub;
  }),
}));

jest.mock('../../../storage/encryptedStorage', () => ({
  randomHex: jest.fn(() => '0123456789abcdef0123456789abcdef'),
}));

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  simulateReady(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onmessage?.({ data: JSON.stringify({ type: 'ready', community_slug: 'quiet-storm', server_time: '2026-01-01T00:00:00Z' }) });
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function latestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

function okTicket() {
  return Promise.resolve({ ticket: 'test-ticket', expires_in: 60 });
}

function goOnline(): void {
  netInfoListener?.({ isConnected: true, isInternetReachable: true });
}
function goOffline(): void {
  netInfoListener?.({ isConnected: false, isInternetReachable: false });
}
function goBackground(): void {
  phaseListener?.('background');
}
function goForeground(): void {
  phaseListener?.('active');
}

let createdSockets: CommunitySocket[] = [];

function makeSocket(request: jest.Mock) {
  const apiClient = { request } as unknown as ConstructorParameters<typeof CommunitySocket>[0];
  const socket = new CommunitySocket(apiClient, { WebSocketImpl: MockWebSocket as unknown as typeof WebSocket });
  createdSockets.push(socket);
  return socket;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  netInfoListener = null;
  phaseListener = null;
  MockWebSocket.instances = [];
  createdSockets = [];
  jest.clearAllMocks();
});

afterEach(() => {
  // Every socket's pending retry/stable/background setTimeout must be torn
  // down, or it leaks a live real-timer handle past the test (disconnect()
  // is idempotent and safe even if the test already called it).
  createdSockets.forEach((s) => s.disconnect());
  jest.useRealTimers();
});

describe('CommunitySocket state transitions', () => {
  it('starts disconnected, then connecting once NetInfo confirms online', async () => {
    const request = jest.fn(() => new Promise(() => {}));
    const socket = makeSocket(request);
    expect(socket.getState()).toBe('disconnected');
    await socket.connect();
    expect(socket.getState()).toBe('disconnected'); // NetInfo hasn't reported yet
    goOnline();
    expect(socket.getState()).toBe('connecting');
  });

  it('moves to connected once the server ready frame arrives', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();
    expect(socket.getState()).toBe('connected');
  });

  it('never puts a bearer token in the WebSocket URL — only the single-use ticket', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    const url = latestSocket().url;
    expect(url).toContain('ticket=test-ticket');
    expect(url).not.toMatch(/bearer/i);
    expect(url.startsWith('ws')).toBe(true);
  });

  it('goes offline immediately when NetInfo reports offline at subscribe time, without fetching a ticket', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOffline();
    expect(socket.getState()).toBe('offline');
    expect(request).not.toHaveBeenCalled();
  });

  it('goes offline when NetInfo reports offline mid-connection, and closes the socket', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();
    expect(socket.getState()).toBe('connected');

    goOffline();
    expect(socket.getState()).toBe('offline');
  });

  it('reconnects once NetInfo reports back online after an offline period', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOffline();
    expect(socket.getState()).toBe('offline');

    goOnline();
    expect(socket.getState()).toBe('connecting');
  });

  it('goes to authExpired on a 401 ticket fetch (refresh already failed once inside apiClient) and never retries', async () => {
    jest.useFakeTimers();
    const request = jest.fn().mockRejectedValue(new ApiError(401, 'http_401'));
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    expect(socket.getState()).toBe('authExpired');
    const callsBefore = request.mock.calls.length;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(request.mock.calls.length).toBe(callsBefore);
  });

  it('goes to suspended on a 403 account_suspended ticket fetch', async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(403, 'account_suspended'));
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    expect(socket.getState()).toBe('suspended');
  });

  it('goes to banned on a 403 account_banned ticket fetch', async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(403, 'account_banned'));
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    expect(socket.getState()).toBe('banned');
  });

  it('goes to banned on a live 4403 close and never auto-reconnects', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    latestSocket().simulateClose(4403);
    expect(socket.getState()).toBe('banned');

    const callsBefore = request.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(request.mock.calls.length).toBe(callsBefore);
  });
});

describe('CommunitySocket reconnect backoff', () => {
  it('retries with increasing exponential delay after repeated failures, and resets after a stable connection', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);

    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateClose(1006);
    expect(socket.getState()).toBe('retrying');

    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(2);

    latestSocket().simulateClose(1006);
    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    expect(MockWebSocket.instances.length).toBe(2); // attempt-1 delay not elapsed yet
    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[1] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(3);

    latestSocket().simulateReady();
    expect(socket.getState()).toBe('connected');
    await jest.advanceTimersByTimeAsync(STABLE_CONNECTION_MS + 1);

    latestSocket().simulateClose(1006);
    // Post-reset, the next retry uses the attempt-0 delay again.
    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(4);
  });

  it('does not reset backoff on a drop before the stable window elapses', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);

    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();
    latestSocket().simulateClose(1006); // drop well before STABLE_CONNECTION_MS

    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('never retries while offline, and schedules no timer', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    goOffline();
    latestSocket().simulateClose(1006);
    expect(socket.getState()).toBe('offline');

    const callsBefore = request.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(request.mock.calls.length).toBe(callsBefore);
  });
});

describe('CommunitySocket optimistic sends', () => {
  it('assigns a client_message_id, sends the frame, and clears it on message.created', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();

    const received: unknown[] = [];
    socket.onMessage((m) => received.push(m));

    const cmid = socket.sendMessage('hello');
    const sentFrame = JSON.parse(latestSocket().sent[latestSocket().sent.length - 1]);
    expect(sentFrame).toEqual({ type: 'message.send', client_message_id: cmid, body: 'hello' });

    latestSocket().simulateMessage({
      type: 'message.created',
      message: { id: 1, client_message_id: cmid, body: 'hello', author: { id: 'u1', display_name: 'Alice' }, created_at: '2026-01-01T00:00:00Z' },
    });
    expect(received).toHaveLength(1);
    expect((received[0] as { clientMessageId: string }).clientMessageId).toBe(cmid);

    // Retrying after confirmation is a no-op — nothing left pending.
    const sentCountBefore = latestSocket().sent.length;
    socket.retryMessage(cmid);
    expect(latestSocket().sent.length).toBe(sentCountBefore);
  });

  it('immediately surfaces a not_connected rejection when sent while not actually OPEN', async () => {
    // A send landing in the same tick as a disconnect must not leave a
    // bubble stuck on "sending…" forever with no server frame ever coming.
    const request = jest.fn(() => new Promise(() => {}));
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();

    const rejections: unknown[] = [];
    socket.onRejected((r) => rejections.push(r));
    const cmid = socket.sendMessage('never sent');

    expect(rejections).toEqual([{ clientMessageId: cmid, code: 'not_connected', retryAfter: null }]);
  });

  it('surfaces message.rejected frames to rejection listeners', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();

    const rejections: unknown[] = [];
    socket.onRejected((r) => rejections.push(r));
    const cmid = socket.sendMessage('spam spam spam');
    latestSocket().simulateMessage({ type: 'message.rejected', client_message_id: cmid, code: 'rate_limited', retry_after: 5 });

    expect(rejections).toEqual([{ clientMessageId: cmid, code: 'rate_limited', retryAfter: 5 }]);
  });

  it('retryMessage resends the same body under the same client_message_id', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();

    const cmid = socket.sendMessage('hello');
    socket.retryMessage(cmid);
    const frames = latestSocket().sent.map((s) => JSON.parse(s));
    expect(frames.filter((f) => f.client_message_id === cmid)).toHaveLength(2);
    expect(new Set(frames.map((f) => f.client_message_id)).size).toBe(1);
  });
});

describe('CommunitySocket reconnect resend', () => {
  it('auto-resends a still-unconfirmed message under the same client_message_id once the connection is ready again, without a duplicate reaching listeners', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    const cmid = socket.sendMessage('are you still there');
    expect(latestSocket().sent.filter((s) => JSON.parse(s).client_message_id === cmid)).toHaveLength(1);

    // Connection drops before message.created ever arrives — pendingSends
    // survives a retrying-reconnect (only disconnect()/offline/background
    // clear it), so the message is still owed a resend.
    latestSocket().simulateClose(1006);
    expect(socket.getState()).toBe('retrying');

    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] + 1);
    await flush();
    latestSocket().simulateReady();

    const resent = latestSocket().sent.filter((s) => JSON.parse(s).client_message_id === cmid);
    expect(resent).toHaveLength(1); // exactly one resend on the new socket

    const received: unknown[] = [];
    socket.onMessage((m) => received.push(m));
    latestSocket().simulateMessage({
      type: 'message.created',
      message: { id: 9, client_message_id: cmid, body: 'are you still there', author: { id: 'u1', display_name: 'Alice' }, created_at: '2026-01-01T00:02:00Z' },
    });
    expect(received).toHaveLength(1); // one confirmation, not a duplicate
  });

  it('does not resend anything once a pending message has already been confirmed', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    const cmid = socket.sendMessage('hello');
    latestSocket().simulateMessage({
      type: 'message.created',
      message: { id: 1, client_message_id: cmid, body: 'hello', author: { id: 'u1', display_name: 'Alice' }, created_at: '2026-01-01T00:00:00Z' },
    });

    latestSocket().simulateClose(1006);
    await jest.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] + 1);
    await flush();
    latestSocket().simulateReady();

    expect(latestSocket().sent.filter((s) => JSON.parse(s).client_message_id === cmid)).toHaveLength(0);
  });
});

describe('CommunitySocket server ping', () => {
  it('replies to a server-initiated ping with a client ping frame', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();

    latestSocket().simulateMessage({ type: 'ping' });
    const lastSent = JSON.parse(latestSocket().sent[latestSocket().sent.length - 1]);
    expect(lastSent).toEqual({ type: 'ping' });
  });
});

describe('CommunitySocket background/foreground lifecycle', () => {
  it('closes the socket after the background grace period elapses while still backgrounded', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    goBackground();
    expect(socket.getState()).toBe('connected'); // grace period not elapsed yet
    await jest.advanceTimersByTimeAsync(30_000 + 1);
    expect(socket.getState()).toBe('disconnected');
  });

  it('does not close the socket if foreground resumes before the grace period elapses', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    goBackground();
    await jest.advanceTimersByTimeAsync(5_000);
    goForeground();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(socket.getState()).toBe('connected'); // never closed
  });

  it('reconnects on foreground resume after the background grace period closed the socket', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    goBackground();
    await jest.advanceTimersByTimeAsync(30_000 + 1);
    expect(socket.getState()).toBe('disconnected');

    goForeground();
    expect(socket.getState()).toBe('connecting');
  });

  it('does not resurrect a connection: a ws-ticket fetch still in flight when the background grace period fires must not open a socket once it resolves', async () => {
    jest.useFakeTimers();
    let resolveTicket!: (v: { ticket: string; expires_in: number }) => void;
    const request = jest.fn(() => new Promise((resolve) => { resolveTicket = resolve; }));
    const socket = makeSocket(request);

    await socket.connect();
    goOnline();
    expect(socket.getState()).toBe('connecting'); // ticket fetch in flight, not yet resolved

    goBackground();
    await jest.advanceTimersByTimeAsync(30_000 + 1);
    expect(socket.getState()).toBe('disconnected'); // grace period closed it

    // The stale fetch finally resolves — must not revive the connection.
    resolveTicket({ ticket: 'late-ticket', expires_in: 60 });
    await flush();
    expect(MockWebSocket.instances.length).toBe(0);
    expect(socket.getState()).toBe('disconnected');
  });

  it('does not resurrect a connection: a ws-ticket fetch still in flight when NetInfo reports offline must not open a socket once it resolves', async () => {
    let resolveTicket!: (v: { ticket: string; expires_in: number }) => void;
    const request = jest.fn(() => new Promise((resolve) => { resolveTicket = resolve; }));
    const socket = makeSocket(request);

    await socket.connect();
    goOnline();
    expect(socket.getState()).toBe('connecting');

    goOffline();
    expect(socket.getState()).toBe('offline');

    resolveTicket({ ticket: 'late-ticket', expires_in: 60 });
    await flush();
    expect(MockWebSocket.instances.length).toBe(0);
    expect(socket.getState()).toBe('offline');
  });
});

describe('CommunitySocket.disconnect()', () => {
  it('tears down listeners and closes the socket without scheduling further reconnects', async () => {
    jest.useFakeTimers();
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await jest.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    socket.disconnect();
    expect(socket.getState()).toBe('disconnected');
    expect(mockNetInfoUnsub).toHaveBeenCalled();
    expect(mockPhaseUnsub).toHaveBeenCalled();

    const callsBefore = request.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(request.mock.calls.length).toBe(callsBefore);
  });

  it('clears pending optimistic sends so a stale retry after disconnect is a no-op', async () => {
    const request = jest.fn(okTicket);
    const socket = makeSocket(request);
    await socket.connect();
    goOnline();
    await flush();
    latestSocket().simulateReady();

    const cmid = socket.sendMessage('hello');
    socket.disconnect();
    const sentBefore = latestSocket().sent.length;
    socket.retryMessage(cmid);
    expect(latestSocket().sent.length).toBe(sentBefore);
  });
});

describe('CommunitySocket.loadHistory', () => {
  it('fetches newest history with no cursor', async () => {
    const request = jest.fn().mockResolvedValue({ messages: [], next_cursor: null });
    const socket = makeSocket(request);
    await socket.loadHistory();
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/community/messages' });
  });

  it('fetches older history with an opaque before cursor', async () => {
    const request = jest.fn().mockResolvedValue({ messages: [], next_cursor: null });
    const socket = makeSocket(request);
    await socket.loadHistory('abc123==');
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/community/messages?before=abc123%3D%3D' });
  });
});
