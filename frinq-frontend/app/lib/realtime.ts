"use client";

/**
 * Community chat WebSocket client — a small state machine wrapping the
 * browser WebSocket. Every (re)connect fetches a fresh single-use ticket
 * via apiFetch (tickets are one-time, per Phase 5's backend) and opens the
 * socket with ONLY that ticket — never a bearer token in the URL, a query
 * string, an analytics event, or a log line.
 *
 * Reconnect backoff: exponential with full jitter (delay = random(0, base)
 * where base follows 1/2/4/8/16/30s by attempt, capped at 30s), reset only
 * after the connection has been open and "ready" for a stable window — a
 * connect-then-immediately-drop loop must not reset backoff prematurely.
 * No retry while the browser/native shell reports offline (navigator.onLine
 * / online-offline events) — reconnecting into a known-dead network just
 * burns battery and produces confusing state flicker.
 */

import { apiFetch } from "./api";
import { apiUrl } from "./session";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "retrying"
  | "offline"
  | "auth_expired"
  | "suspended"
  | "banned";

export interface RealtimeAuthor {
  id: string;
  displayName: string | null;
}

export interface RealtimeMessage {
  id: number;
  clientMessageId: string;
  body: string;
  author: RealtimeAuthor;
  createdAt: string;
}

export interface RealtimeRejection {
  clientMessageId: string;
  code: string;
  retryAfter: number | null;
}

type Unsubscribe = () => void;

export const BASE_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
export const STABLE_CONNECTION_MS = 5000;

export function delayForAttempt(attempt: number): number {
  const base = BASE_DELAYS_MS[Math.min(attempt, BASE_DELAYS_MS.length - 1)];
  return Math.random() * base; // full jitter: uniform in [0, base)
}

export function wsUrl(path: string): string {
  return apiUrl(path).replace(/^http/, "ws");
}

export interface RealtimeClientOptions {
  /** Injectable for tests — defaults to the global WebSocket constructor. */
  WebSocketImpl?: typeof WebSocket;
}

export class CommunityRealtimeClient {
  private state: ConnectionState = "disconnected";
  private ws: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();
  private readonly messageListeners = new Set<(m: RealtimeMessage) => void>();
  private readonly rejectListeners = new Set<(r: RealtimeRejection) => void>();
  /** clientMessageId -> body, so a disconnect-then-retry can resend the
   * exact same body under the exact same idempotency key. */
  private readonly pendingSends = new Map<string, string>();
  private readonly onlineHandler = () => this.handleOnline();
  private readonly offlineHandler = () => this.handleOffline();

  constructor(options: RealtimeClientOptions = {}) {
    this.WebSocketImpl =
      options.WebSocketImpl ?? (typeof WebSocket !== "undefined" ? WebSocket : (undefined as unknown as typeof WebSocket));
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(cb: (s: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  onMessage(cb: (m: RealtimeMessage) => void): Unsubscribe {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onRejected(cb: (r: RealtimeRejection) => void): Unsubscribe {
    this.rejectListeners.add(cb);
    return () => this.rejectListeners.delete(cb);
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((cb) => cb(next));
  }

  private isOffline(): boolean {
    return typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
    }
    if (this.isOffline()) {
      this.setState("offline");
      return;
    }
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("offline", this.offlineHandler);
    }
    this.ws?.close(1000);
    this.ws = null;
    this.setState("disconnected");
  }

  private clearTimers(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.stableTimer) { clearTimeout(this.stableTimer); this.stableTimer = null; }
  }

  private handleOnline(): void {
    if (this.stopped) return;
    if (this.state === "offline") {
      this.attempt = 0;
      void this.connect();
    }
  }

  private handleOffline(): void {
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
    this.setState("offline");
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setState(this.attempt === 0 ? "connecting" : "retrying");

    let ticket: string;
    try {
      const res = await apiFetch("/api/v1/community/ws-ticket", { method: "POST" });
      if (this.stopped) return;
      if (res.status === 401) {
        this.setState("auth_expired");
        return;
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        const detail = (body as { detail?: { code?: string } }).detail;
        this.setState(detail?.code === "account_suspended" ? "suspended" : "banned");
        return;
      }
      if (!res.ok) {
        this.scheduleRetry();
        return;
      }
      const data = await res.json();
      ticket = data.ticket;
    } catch {
      this.scheduleRetry();
      return;
    }

    if (this.stopped) return;

    const socket = new this.WebSocketImpl(wsUrl(`/api/v1/ws/community?ticket=${encodeURIComponent(ticket)}`));
    this.ws = socket;
    socket.onmessage = (event) => this.handleFrame(String(event.data));
    socket.onclose = (event) => this.handleClose(event.code);
  }

  private handleFrame(raw: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case "ready":
        this.setState("connected");
        // Only reset backoff once the connection has proven stable for a
        // while — a connect-then-immediately-drop loop shouldn't get to
        // reset back to the fastest retry cadence.
        this.stableTimer = setTimeout(() => { this.attempt = 0; }, STABLE_CONNECTION_MS);
        break;
      case "message.created": {
        const m = data.message as Record<string, unknown>;
        const clientMessageId = String(m.client_message_id);
        this.pendingSends.delete(clientMessageId);
        const author = m.author as Record<string, unknown> | null;
        this.messageListeners.forEach((cb) => cb({
          id: Number(m.id),
          clientMessageId,
          body: String(m.body),
          author: { id: author ? String(author.id) : "", displayName: (author?.display_name as string | null) ?? null },
          createdAt: String(m.created_at),
        }));
        break;
      }
      case "message.rejected":
        this.rejectListeners.forEach((cb) => cb({
          clientMessageId: String(data.client_message_id),
          code: String(data.code),
          retryAfter: (data.retry_after as number | null) ?? null,
        }));
        break;
      case "ping":
        // Server-initiated liveness ping — any client frame counts as
        // activity server-side; replying with our own "ping" (the only
        // valid client-frame shape) is the protocol-conformant response.
        this.send({ type: "ping" });
        break;
      default:
        break;
    }
  }

  /** Returns whether the frame was actually handed to an OPEN socket —
   * callers must not assume a call to send() means the frame went out. */
  private send(frame: unknown): boolean {
    if (this.ws && this.ws.readyState === this.WebSocketImpl.OPEN) {
      this.ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }

  private notifyNotConnected(clientMessageId: string): void {
    // The UI gates sending on connectionState === "connected", but a
    // click can still land in the same tick as a disconnect (state hasn't
    // re-rendered yet). Without this, an unsent frame would leave its
    // bubble stuck on "sending…" forever — no server frame is ever coming
    // back for a message that was never actually transmitted.
    this.rejectListeners.forEach((cb) => cb({ clientMessageId, code: "not_connected", retryAfter: null }));
  }

  /** Returns the new message's client_message_id (UUID v4). */
  sendMessage(body: string): string {
    const clientMessageId = crypto.randomUUID();
    this.pendingSends.set(clientMessageId, body);
    const sent = this.send({ type: "message.send", client_message_id: clientMessageId, body });
    if (!sent) this.notifyNotConnected(clientMessageId);
    return clientMessageId;
  }

  /** Resends a previously-sent message under the SAME client_message_id —
   * safe because the server's insert is idempotent on that key. */
  retryMessage(clientMessageId: string): void {
    const body = this.pendingSends.get(clientMessageId);
    if (body == null) return;
    const sent = this.send({ type: "message.send", client_message_id: clientMessageId, body });
    if (!sent) this.notifyNotConnected(clientMessageId);
  }

  private handleClose(code: number): void {
    if (this.stableTimer) { clearTimeout(this.stableTimer); this.stableTimer = null; }
    this.ws = null;
    if (this.stopped) return;

    if (code === 4403) {
      // Banned or suspended via a live control event — never auto-reconnect.
      this.setState("banned");
      return;
    }
    // 4401 (invalid/expired/replayed ticket) and any other close reason are
    // all handled the same way: get a fresh ticket and retry with backoff.
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    if (this.isOffline()) {
      this.setState("offline");
      return;
    }
    this.setState("retrying");
    const delay = delayForAttempt(this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => { void this.connect(); }, delay);
  }
}
