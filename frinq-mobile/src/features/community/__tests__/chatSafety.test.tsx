/**
 * Task 45 — the one genuine reconnect gap identified: CommunityScreen.test.tsx
 * and CommunitySocket.test.ts each prove their own half (screen wiring vs.
 * socket resend) against a fake counterpart. This wires the REAL
 * CommunitySocket to a REAL CommunityScreen over a mock WebSocket, so the
 * whole chain — send -> drop -> auto-resend -> message.created -> dedupe by
 * clientMessageId — is proven end to end, not just at each seam.
 *
 * Two-user report/block coverage already exists in full in
 * safetyActions.test.tsx — not duplicated here.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CommunityScreen } from '../screens/CommunityScreen';
import { BASE_DELAYS_MS } from '../../../services/realtime/realtimeMachine';

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('../../../services/push/pushService', () => ({
  hasPushPermission: async () => true,
  hasShownPushOptInPrompt: async () => true,
  markPushOptInPromptShown: async () => {},
  registerCurrentToken: async () => {},
  requestPushPermission: async () => 'granted',
  setPushEnabled: async () => {},
}));

type NetInfoListener = (state: { isConnected: boolean; isInternetReachable: boolean }) => void;
let netInfoListener: NetInfoListener | null = null;
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((cb: NetInfoListener) => {
    netInfoListener = cb;
    return jest.fn();
  }),
}));

jest.mock('../../../services/lifecycle/appLifecycle', () => ({
  onAppPhase: jest.fn(() => jest.fn()),
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

// The real CommunitySocket picks its WebSocket implementation from the global
// unless one is injected — CommunityScreen constructs it with no override, so
// this stands in for the RN global the real device/emulator provides.
(globalThis as any).WebSocket = MockWebSocket;

const USER_IN_COMMUNITY = {
  id: 'user-1',
  community_slug: 'quiet-storm',
  onboarding_complete: true,
  onboarding_state: 'active',
  banned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  MockWebSocket.instances = [];
  netInfoListener = null;
});

describe('reconnect does not duplicate a message', () => {
  // Under parallel-worker CPU load this chain (profile fetch -> loadHistory ->
  // connect -> retry timer -> reconnect) can occasionally outrun Jest's
  // default 5s test timeout even though nothing is actually broken — same
  // documented flake as safetyActions.test.tsx's renderWithOtherMessage.
  it('auto-resends a message dropped mid-flight and shows it exactly once once confirmed', async () => {
    jest.useFakeTimers();
    const request = jest.fn().mockImplementation(({ path }: { path: string }) => {
      if (path === '/api/v1/users/me') return Promise.resolve(USER_IN_COMMUNITY);
      if (path === '/api/v1/community/messages') return Promise.resolve({ messages: [], next_cursor: null });
      if (path === '/api/v1/community/ws-ticket') return Promise.resolve({ ticket: 'test-ticket', expires_in: 60 });
      return Promise.resolve(undefined);
    });
    mockUseSession.mockReturnValue({ apiClient: { request } });

    const { findByLabelText, findAllByText } = render(<CommunityScreen />);
    // The composer renders as soon as ChatView mounts (disabled until
    // connected) — waiting for it guarantees socket.connect() has already run
    // and subscribed the NetInfo listener below.
    const input = await findByLabelText('message');

    await act(async () => {
      netInfoListener?.({ isConnected: true, isInternetReachable: true });
      await flush();
    });
    await act(async () => {
      latestSocket().simulateReady();
    });

    fireEvent.changeText(input, 'are you still there');
    fireEvent(input, 'submitEditing');

    // Confirm it actually went out before the drop.
    expect(latestSocket().sent.some((s) => JSON.parse(s).body === 'are you still there')).toBe(true);
    const cmid = JSON.parse(latestSocket().sent[latestSocket().sent.length - 1]).client_message_id;

    // Drops before any message.created frame arrives — reconnects automatically.
    await act(async () => {
      latestSocket().simulateClose(1006);
    });
    await act(async () => {
      jest.advanceTimersByTime(BASE_DELAYS_MS[0] + 1);
      await flush();
    });
    await act(async () => {
      latestSocket().simulateReady();
    });

    // The new socket resent it under the same client_message_id — never a
    // second, distinct id for the same user-authored text.
    const resent = latestSocket().sent.filter((s) => JSON.parse(s).client_message_id === cmid);
    expect(resent).toHaveLength(1);

    await act(async () => {
      latestSocket().simulateMessage({
        type: 'message.created',
        message: { id: 42, client_message_id: cmid, body: 'are you still there', author: { id: 'user-1', display_name: null }, created_at: '2026-01-01T00:05:00Z' },
      });
    });

    expect(await findAllByText('are you still there')).toHaveLength(1);
    jest.useRealTimers();
  }, 15000);
});
