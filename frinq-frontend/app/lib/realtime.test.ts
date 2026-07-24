import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "./api";
import {
  BASE_DELAYS_MS,
  CommunityRealtimeClient,
  STABLE_CONNECTION_MS,
  delayForAttempt,
} from "./realtime";

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

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
    this.onmessage?.({ data: JSON.stringify({ type: "ready", community_slug: "quiet-storm", server_time: "2026-01-01T00:00:00Z" }) });
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function okTicketResponse() {
  return { status: 200, ok: true, json: async () => ({ ticket: "test-ticket", expires_in: 60 }) };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function latestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

beforeEach(() => {
  MockWebSocket.instances = [];
  mockApiFetch.mockReset();
  setOnline(true);
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
});

/** Flushes the full apiFetch()-then-res.json() microtask chain. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeClient() {
  return new CommunityRealtimeClient({ WebSocketImpl: MockWebSocket as unknown as typeof WebSocket });
}

describe("delayForAttempt", () => {
  it("uses the exact base delay progression 1/2/4/8/16/30s capped, full jitter in [0, base)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(delayForAttempt(0)).toBeCloseTo(BASE_DELAYS_MS[0], 0);
    expect(delayForAttempt(1)).toBeCloseTo(BASE_DELAYS_MS[1], 0);
    expect(delayForAttempt(2)).toBeCloseTo(BASE_DELAYS_MS[2], 0);
    expect(delayForAttempt(3)).toBeCloseTo(BASE_DELAYS_MS[3], 0);
    expect(delayForAttempt(4)).toBeCloseTo(BASE_DELAYS_MS[4], 0);
    expect(delayForAttempt(5)).toBeCloseTo(BASE_DELAYS_MS[5], 0);
    expect(delayForAttempt(99)).toBeCloseTo(BASE_DELAYS_MS[5], 0); // capped at 30s
  });

  it("is a full jitter (can be as low as 0)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(delayForAttempt(0)).toBe(0);
  });
});

describe("CommunityRealtimeClient state transitions", () => {
  it("starts disconnected and moves to connecting on start()", async () => {
    mockApiFetch.mockResolvedValue(new Promise(() => {})); // never resolves, just checking initial state
    const client = makeClient();
    expect(client.getState()).toBe("disconnected");
    client.start();
    expect(client.getState()).toBe("connecting");
  });

  it("moves to connected once the server ready frame arrives", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();
    expect(client.getState()).toBe("connected");
  });

  it("never puts the bearer token or ticket in the WebSocket URL as anything but the ticket param", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    const url = latestSocket().url;
    expect(url).toContain("ticket=test-ticket");
    expect(url).not.toMatch(/bearer/i);
    expect(url.startsWith("ws")).toBe(true);
  });

  it("goes offline immediately when navigator.onLine is false, without fetching a ticket", () => {
    setOnline(false);
    const client = makeClient();
    client.start();
    expect(client.getState()).toBe("offline");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("goes offline on a browser offline event and cancels the pending connection", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();
    expect(client.getState()).toBe("connected");

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(client.getState()).toBe("offline");
  });

  it("resumes and reconnects on the online event after going offline", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    setOnline(false);
    client.start();
    expect(client.getState()).toBe("offline");

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(client.getState()).toBe("connecting");
  });

  it("goes to auth_expired on a 401 ticket fetch and does not schedule a retry", async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });
    const client = makeClient();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getState()).toBe("auth_expired");
    const callsBefore = mockApiFetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockApiFetch.mock.calls.length).toBe(callsBefore); // never retried
  });

  it("goes to suspended when the ticket fetch 403s with account_suspended", async () => {
    mockApiFetch.mockResolvedValue({
      status: 403, ok: false, json: async () => ({ detail: { code: "account_suspended", suspended_until: "2027-01-01T00:00:00Z" } }),
    });
    const client = makeClient();
    client.start();
    await flush();
    expect(client.getState()).toBe("suspended");
  });

  it("goes to banned when the ticket fetch 403s with account_banned", async () => {
    mockApiFetch.mockResolvedValue({ status: 403, ok: false, json: async () => ({ detail: { code: "account_banned" } }) });
    const client = makeClient();
    client.start();
    await flush();
    expect(client.getState()).toBe("banned");
  });

  it("goes to banned on a live 4403 close and never auto-reconnects", async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    latestSocket().simulateClose(4403);
    expect(client.getState()).toBe("banned");

    const callsBefore = mockApiFetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockApiFetch.mock.calls.length).toBe(callsBefore);
  });
});

describe("CommunityRealtimeClient reconnect backoff", () => {
  it("retries with increasing exponential delay after repeated failures, and resets after a stable connection", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // deterministic mid-range jitter
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    // First socket fails immediately (no "ready") — simulate a drop.
    latestSocket().simulateClose(1006);
    expect(client.getState()).toBe("retrying");

    // attempt 0 -> delay ~= 0.5 * 1000ms
    await vi.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(2);

    latestSocket().simulateClose(1006);
    // attempt 1 -> delay ~= 0.5 * 2000ms — should NOT have reconnected yet
    // after only the attempt-0-sized delay.
    await vi.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    expect(MockWebSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(BASE_DELAYS_MS[1] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(3);

    // Now let it succeed and stay stable — attempt counter should reset.
    latestSocket().simulateReady();
    expect(client.getState()).toBe("connected");
    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS + 1);

    latestSocket().simulateClose(1006);
    // Post-reset, the very next retry should again use the attempt-0 delay,
    // not continue climbing from attempt 2.
    await vi.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(4);
  });

  it("does not reset backoff on a drop that happens before the stable window elapses", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();
    // Drop immediately, well before STABLE_CONNECTION_MS elapses.
    latestSocket().simulateClose(1006);

    // Because attempt was never reset, the retry delay should still be the
    // attempt-0 delay (first-ever retry) — reconnect happens at ~500ms.
    await vi.advanceTimersByTimeAsync(BASE_DELAYS_MS[0] * 0.5 + 1);
    await flush();
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it("never retries while offline, and does not schedule a timer", async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    setOnline(false);
    latestSocket().simulateClose(1006);
    expect(client.getState()).toBe("offline");

    const callsBefore = mockApiFetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockApiFetch.mock.calls.length).toBe(callsBefore);
  });
});

describe("optimistic sends", () => {
  it("assigns a client_message_id, sends the frame, and clears it on message.created", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();

    const received: unknown[] = [];
    client.onMessage((m) => received.push(m));

    const cmid = client.sendMessage("hello");
    const sentFrame = JSON.parse(latestSocket().sent[latestSocket().sent.length - 1]);
    expect(sentFrame).toEqual({ type: "message.send", client_message_id: cmid, body: "hello" });

    latestSocket().simulateMessage({
      type: "message.created",
      message: { id: 1, client_message_id: cmid, body: "hello", author: { id: "u1", display_name: "Alice" }, created_at: "2026-01-01T00:00:00Z" },
    });
    expect(received).toHaveLength(1);
    expect((received[0] as { clientMessageId: string }).clientMessageId).toBe(cmid);

    // Retrying after it's already been confirmed is a no-op (nothing left pending).
    const sentCountBefore = latestSocket().sent.length;
    client.retryMessage(cmid);
    expect(latestSocket().sent.length).toBe(sentCountBefore);
  });

  it("immediately surfaces a not_connected rejection if sent while not actually OPEN", async () => {
    // Regression: a click landing in the same tick as a disconnect must
    // not leave a bubble stuck on "sending…" forever with no server frame
    // ever coming back for a message that was never transmitted.
    mockApiFetch.mockResolvedValue(new Promise(() => {})); // never resolves — stays "connecting"
    const client = makeClient();
    client.start();

    const rejections: unknown[] = [];
    client.onRejected((r) => rejections.push(r));
    const cmid = client.sendMessage("never sent");

    expect(rejections).toEqual([{ clientMessageId: cmid, code: "not_connected", retryAfter: null }]);
  });

  it("surfaces message.rejected frames to rejection listeners", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();

    const rejections: unknown[] = [];
    client.onRejected((r) => rejections.push(r));
    const cmid = client.sendMessage("spam spam spam");
    latestSocket().simulateMessage({ type: "message.rejected", client_message_id: cmid, code: "rate_limited", retry_after: 5 });

    expect(rejections).toEqual([{ clientMessageId: cmid, code: "rate_limited", retryAfter: 5 }]);
  });

  it("retryMessage resends the same body under the same client_message_id", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();

    const cmid = client.sendMessage("hello");
    client.retryMessage(cmid);
    const frames = latestSocket().sent.map((s) => JSON.parse(s));
    expect(frames.filter((f) => f.client_message_id === cmid)).toHaveLength(2);
    expect(new Set(frames.map((f) => f.client_message_id)).size).toBe(1);
  });
});

describe("server ping", () => {
  it("replies to a server-initiated ping with a client ping frame", async () => {
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await flush();
    latestSocket().simulateReady();

    latestSocket().simulateMessage({ type: "ping" });
    const lastSent = JSON.parse(latestSocket().sent[latestSocket().sent.length - 1]);
    expect(lastSent).toEqual({ type: "ping" });
  });
});

describe("stop()", () => {
  it("tears down listeners and closes the socket without scheduling further reconnects", async () => {
    vi.useFakeTimers();
    mockApiFetch.mockResolvedValue(okTicketResponse());
    const client = makeClient();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    latestSocket().simulateReady();

    client.stop();
    expect(client.getState()).toBe("disconnected");

    const callsBefore = mockApiFetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockApiFetch.mock.calls.length).toBe(callsBefore);
  });
});
