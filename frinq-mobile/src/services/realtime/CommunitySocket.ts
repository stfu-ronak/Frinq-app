import NetInfo from '@react-native-community/netinfo';
import { ApiClient } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { API_BASE_URL } from '../api/config';
import { MessageHistoryResponse, WsTicketResponse } from '../api/contracts';
import { onAppPhase, AppPhase } from '../lifecycle/appLifecycle';
import { uuidv4 } from '../util/uuid';
import {
  BACKGROUND_GRACE_MS,
  ConnectionState,
  STABLE_CONNECTION_MS,
  classifyTicketError,
  closeCodeOutcome,
  delayForAttempt,
} from './realtimeMachine';

/**
 * Ticketed native WebSocket client for community chat. Ported from
 * frinq-frontend/app/lib/realtime.ts (Task 21's web equivalent); the
 * connection-state/backoff decisions live in realtimeMachine.ts so this file
 * is just the imperative shell: fetch a fresh single-use ticket for every
 * (re)connect, put ONLY that ticket in the URL (never a bearer token, phone,
 * or message content in the URL/logs), and translate RN's WebSocket +
 * NetInfo + AppState signals into realtimeMachine's pure decisions.
 */

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

export interface PendingMessage {
  clientMessageId: string;
  body: string;
}

export type MessagePage = MessageHistoryResponse;

type Unsubscribe = () => void;

function wsUrl(path: string): string {
  return `${API_BASE_URL}${path}`.replace(/^http/, 'ws');
}

export interface CommunitySocketOptions {
  /** Injectable for tests — defaults to RN's global WebSocket. */
  WebSocketImpl?: typeof WebSocket;
}

export class CommunitySocket {
  private state: ConnectionState = 'disconnected';
  private ws: WebSocket | null = null;
  private attempt = 0;
  private offline = false;
  private stopped = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set right before a deliberate background-grace close so the resulting
   *  onclose->handleClose does NOT auto-retry. Reconnection after backgrounding
   *  is driven only by foreground resume (handlePhase). Without this the grace
   *  close reconnects within ~1s in the background (battery/data drain) and can
   *  race a second socket on resume. */
  private suppressRetryOnClose = false;
  /** Incremented by disconnect(), the background-grace-period close, and the
   *  offline transition — every place that forces the connection closed
   *  outside doConnect() itself. A doConnect() awaiting the ws-ticket fetch
   *  when one of those fires must not open a socket once it resumes; it
   *  captures the generation on entry and bails if it no longer matches,
   *  instead of silently reviving a connection that was just torn down. */
  private generation = 0;
  private unbindLifecycle: Unsubscribe | null = null;
  private unbindNetwork: Unsubscribe | null = null;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();
  private readonly messageListeners = new Set<(m: RealtimeMessage) => void>();
  private readonly rejectListeners = new Set<(r: RealtimeRejection) => void>();
  /** clientMessageId -> body, so a disconnect-then-retry resends the exact
   *  same body under the exact same idempotency key. */
  private readonly pendingSends = new Map<string, string>();

  constructor(
    private readonly apiClient: ApiClient,
    options: CommunitySocketOptions = {},
  ) {
    this.WebSocketImpl = options.WebSocketImpl ?? (WebSocket as unknown as typeof WebSocket);
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

  async connect(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    this.unbindLifecycle = onAppPhase((phase) => this.handlePhase(phase));

    let firstNetworkEvent = true;
    this.unbindNetwork = NetInfo.addEventListener((s) => {
      const online = s.isConnected !== false && s.isInternetReachable !== false;
      if (firstNetworkEvent) {
        firstNetworkEvent = false;
        this.offline = !online;
        if (this.offline) this.setState('offline');
        else void this.doConnect();
        return;
      }
      this.handleNetworkChange(online);
    });
  }

  disconnect(_reason?: string): void {
    this.stopped = true;
    this.generation += 1;
    this.clearTimers();
    this.unbindLifecycle?.();
    this.unbindLifecycle = null;
    this.unbindNetwork?.();
    this.unbindNetwork = null;
    this.pendingSends.clear();
    this.ws?.close(1000);
    this.ws = null;
    this.setState('disconnected');
  }

  /** GET /api/v1/community/messages, cursor-paginated (Task 5's MessageHistoryResponse). */
  async loadHistory(cursor?: string): Promise<MessagePage> {
    const path = cursor
      ? `/api/v1/community/messages?before=${encodeURIComponent(cursor)}`
      : '/api/v1/community/messages';
    return this.apiClient.request<MessagePage>({ path });
  }

  private clearTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  private handleNetworkChange(online: boolean): void {
    if (this.stopped) return;
    if (!online) {
      this.offline = true;
      this.generation += 1;
      this.clearTimers();
      this.ws?.close(1000);
      this.ws = null;
      this.setState('offline');
      return;
    }
    if (this.offline) {
      this.offline = false;
      this.attempt = 0;
      void this.doConnect();
    }
  }

  private handlePhase(phase: AppPhase): void {
    if (this.stopped) return;
    if (phase === 'background') {
      // A brief app-switch shouldn't tear down a live socket — only close
      // after the grace period elapses while still backgrounded.
      this.backgroundTimer = setTimeout(() => {
        this.backgroundTimer = null;
        this.generation += 1;
        this.clearTimers();
        this.suppressRetryOnClose = true;
        this.ws?.close(1000);
        this.ws = null;
        this.setState('disconnected');
      }, BACKGROUND_GRACE_MS);
      return;
    }
    // Resumed before the grace period fired — cancel it, socket never closed.
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
      return;
    }
    // The background timer already closed the socket — reconnect. The fresh
    // ws-ticket fetch IS the revalidation checkpoint (the backend re-checks
    // session/legal/membership at both ticket issuance and WS handshake), so
    // there's nothing extra to revalidate client-side here.
    if (this.state === 'disconnected' && !this.offline) {
      this.attempt = 0;
      void this.doConnect();
    }
  }

  private async doConnect(): Promise<void> {
    if (this.stopped) return;
    // Captured on entry: if disconnect()/offline/background-close fires
    // while the ws-ticket fetch below is in flight, generation moves on and
    // this call must bail instead of opening a socket the app no longer
    // wants — otherwise a stalled fetch can silently resurrect a connection
    // that was just deliberately torn down.
    const gen = this.generation;
    this.setState(this.attempt === 0 ? 'connecting' : 'retrying');

    let ticket: string;
    try {
      const data = await this.apiClient.request<WsTicketResponse>({
        path: '/api/v1/community/ws-ticket',
        method: 'POST',
      });
      if (this.stopped || gen !== this.generation) return;
      ticket = data.ticket;
    } catch (err) {
      if (this.stopped || gen !== this.generation) return;
      if (err instanceof ApiError) {
        const outcome = classifyTicketError(err.status, err.code);
        if (outcome !== 'retry') {
          this.setState(outcome);
          return;
        }
      }
      this.scheduleRetry();
      return;
    }

    if (this.stopped || gen !== this.generation) return;
    const socket = new this.WebSocketImpl(wsUrl(`/api/v1/ws/community?ticket=${encodeURIComponent(ticket)}`));
    this.ws = socket;
    socket.onmessage = (event: { data?: unknown }) => this.handleFrame(String(event.data));
    socket.onclose = (event: { code?: number }) => this.handleClose(event.code ?? 1006);
  }

  private handleFrame(raw: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case 'ready':
        this.setState('connected');
        // Only reset backoff once the connection has proven stable — a
        // connect-then-immediately-drop loop must not reset it prematurely.
        this.stableTimer = setTimeout(() => {
          this.attempt = 0;
        }, STABLE_CONNECTION_MS);
        // Anything still in pendingSends was sent before a prior drop and
        // never confirmed (no message.created, no message.rejected) — resend
        // it now under the SAME client_message_id. Safe: the server's insert
        // is idempotent on that key, so a message that actually landed before
        // the drop just gets its existing row's frame echoed back.
        this.resendPending();
        break;
      case 'message.created': {
        const m = data.message as Record<string, unknown> | null;
        // A malformed frame (missing/null `message`) must not throw inside the
        // ws.onmessage handler — ignore it rather than crash the socket.
        if (!m || typeof m !== 'object') break;
        const clientMessageId = String(m.client_message_id);
        this.pendingSends.delete(clientMessageId);
        const author = m.author as Record<string, unknown> | null;
        this.messageListeners.forEach((cb) =>
          cb({
            id: Number(m.id),
            clientMessageId,
            body: String(m.body),
            author: { id: author ? String(author.id) : '', displayName: (author?.display_name as string | null) ?? null },
            createdAt: String(m.created_at),
          }),
        );
        break;
      }
      case 'message.rejected':
        this.rejectListeners.forEach((cb) =>
          cb({
            clientMessageId: String(data.client_message_id),
            code: String(data.code),
            retryAfter: (data.retry_after as number | null) ?? null,
          }),
        );
        break;
      case 'ping':
        // Server-initiated liveness ping — any client frame counts as
        // activity server-side; "ping" back is the protocol-conformant reply.
        this.send({ type: 'ping' });
        break;
      default:
        break;
    }
  }

  private resendPending(): void {
    this.pendingSends.forEach((body, clientMessageId) => {
      this.send({ type: 'message.send', client_message_id: clientMessageId, body });
    });
  }

  /** Returns whether the frame reached an OPEN socket — callers must not
   *  assume a call here means the frame actually went out. */
  private send(frame: unknown): boolean {
    if (this.ws && this.ws.readyState === this.WebSocketImpl.OPEN) {
      this.ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }

  private notifyNotConnected(clientMessageId: string): void {
    // The UI gates sending on connectionState === 'connected', but a tap can
    // still land in the same tick as a disconnect. Without this, an unsent
    // frame would leave its bubble stuck on "sending…" forever.
    this.rejectListeners.forEach((cb) => cb({ clientMessageId, code: 'not_connected', retryAfter: null }));
  }

  /** Returns the new message's client_message_id (UUID v4). */
  sendMessage(body: string): string {
    const clientMessageId = uuidv4();
    this.pendingSends.set(clientMessageId, body);
    const sent = this.send({ type: 'message.send', client_message_id: clientMessageId, body });
    if (!sent) this.notifyNotConnected(clientMessageId);
    return clientMessageId;
  }

  /** Resends a previously-sent message under the SAME client_message_id —
   *  safe because the server's insert is idempotent on that key. */
  retryMessage(clientMessageId: string): void {
    const body = this.pendingSends.get(clientMessageId);
    if (body == null) return;
    const sent = this.send({ type: 'message.send', client_message_id: clientMessageId, body });
    if (!sent) this.notifyNotConnected(clientMessageId);
  }

  private handleClose(code: number): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.ws = null;
    if (this.suppressRetryOnClose) {
      // Deliberate background-grace close — reconnect happens on foreground
      // resume (handlePhase), not here. Auto-retrying would defeat the grace
      // period and can open a second socket racing the resume.
      this.suppressRetryOnClose = false;
      return;
    }
    if (this.stopped) return;

    if (closeCodeOutcome(code) === 'banned') {
      this.setState('banned');
      return;
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    if (this.offline) {
      this.setState('offline');
      return;
    }
    this.setState('retrying');
    const delay = delayForAttempt(this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      void this.doConnect();
    }, delay);
  }
}
