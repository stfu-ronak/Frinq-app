import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CommunityScreen } from '../screens/CommunityScreen';

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

// Real pushService.ts imports @react-native-firebase/messaging, which isn't
// natively linked (or transform-allowed for Jest) yet — mocked wholesale
// rather than reaching into that package from this unrelated test file.
const mockHasPushPermission = jest.fn().mockResolvedValue(true);
const mockHasShownPushOptInPrompt = jest.fn().mockResolvedValue(true);
jest.mock('../../../services/push/pushService', () => ({
  hasPushPermission: (...args: unknown[]) => mockHasPushPermission(...args),
  hasShownPushOptInPrompt: (...args: unknown[]) => mockHasShownPushOptInPrompt(...args),
  markPushOptInPromptShown: jest.fn().mockResolvedValue(undefined),
  registerCurrentToken: jest.fn().mockResolvedValue(undefined),
  requestPushPermission: jest.fn().mockResolvedValue('granted'),
  setPushEnabled: jest.fn().mockResolvedValue(undefined),
}));

type Listener<T> = (arg: T) => void;

// jest.mock's factory may only reference mock-prefixed identifiers (hoisting
// rule) — this indirection lets the real FakeSocket class (declared normally
// below, referenced only inside beforeEach, well after module evaluation)
// stay out of the factory itself.
const mockCreateSocket = jest.fn();
jest.mock('../../../services/realtime/CommunitySocket', () => ({
  CommunitySocket: jest.fn().mockImplementation((...args: unknown[]) => mockCreateSocket(...args)),
}));

let nextInitialHistoryPage: { messages: unknown[]; next_cursor: string | null } = { messages: [], next_cursor: null };

class FakeSocket {
  static instances: FakeSocket[] = [];
  connect = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
  sendMessage = jest.fn((body: string) => `cmid-${body}`);
  retryMessage = jest.fn();
  loadHistory = jest.fn().mockResolvedValueOnce(nextInitialHistoryPage).mockResolvedValue({ messages: [], next_cursor: null });
  private stateListeners: Listener<string>[] = [];
  private messageListeners: Listener<any>[] = [];
  private rejectListeners: Listener<any>[] = [];

  constructor() {
    FakeSocket.instances.push(this);
  }

  onStateChange(cb: Listener<string>) {
    this.stateListeners.push(cb);
    return () => {};
  }
  onMessage(cb: Listener<any>) {
    this.messageListeners.push(cb);
    return () => {};
  }
  onRejected(cb: Listener<any>) {
    this.rejectListeners.push(cb);
    return () => {};
  }
  emitState(s: string) {
    this.stateListeners.forEach((cb) => cb(s));
  }
  emitMessage(m: any) {
    this.messageListeners.forEach((cb) => cb(m));
  }
  emitRejected(r: any) {
    this.rejectListeners.forEach((cb) => cb(r));
  }
}

mockCreateSocket.mockImplementation(() => new FakeSocket());

function latestSocket(): FakeSocket {
  return FakeSocket.instances[FakeSocket.instances.length - 1];
}

const USER_IN_COMMUNITY = {
  id: 'user-1',
  community_slug: 'quiet-storm',
  onboarding_complete: true,
  onboarding_state: 'active',
  banned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const USER_NO_COMMUNITY = { ...USER_IN_COMMUNITY, community_slug: null };

beforeEach(() => {
  jest.clearAllMocks();
  FakeSocket.instances = [];
  nextInitialHistoryPage = { messages: [], next_cursor: null };
  mockHasPushPermission.mockResolvedValue(true);
  mockHasShownPushOptInPrompt.mockResolvedValue(true);
});

describe('CommunityScreen view states', () => {
  it('shows the empty/no-membership state when the user has no community yet', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_NO_COMMUNITY) } });
    const { findByText } = render(<CommunityScreen />);
    expect(await findByText('no community assigned yet')).toBeTruthy();
  });

  it('shows a retryable offline state when the profile fetch fails', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockRejectedValue(new Error('network')) } });
    const { findByText } = render(<CommunityScreen />);
    expect(await findByText("couldn't load your community.")).toBeTruthy();
  });

  it('renders the community header and composer once membership resolves', async () => {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });
    const { findByText, findByLabelText } = render(<CommunityScreen />);
    expect(await findByText('Quiet Storm')).toBeTruthy();
    expect(await findByLabelText('message')).toBeTruthy();
  });
});

describe('CommunityScreen chat behavior', () => {
  async function renderReady() {
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });
    const utils = render(<CommunityScreen />);
    await utils.findByLabelText('message');
    return utils;
  }

  it('disables the composer until the socket reports connected', async () => {
    const { findByLabelText } = await renderReady();
    const input = await findByLabelText('message');
    expect(input.props.editable).toBe(false);

    await act(async () => {
      latestSocket().emitState('connected');
    });
    expect((await findByLabelText('message')).props.editable).toBe(true);
  });

  it('sends a message and renders it optimistically as sending, then confirmed', async () => {
    const { findByLabelText, findByText } = await renderReady();
    await act(async () => {
      latestSocket().emitState('connected');
    });

    fireEvent.changeText(await findByLabelText('message'), 'hello there');
    fireEvent(await findByLabelText('message'), 'submitEditing');

    expect(await findByText('hello there')).toBeTruthy();
    expect(await findByText('sending…')).toBeTruthy();

    await act(async () => {
      latestSocket().emitMessage({
        id: 1,
        clientMessageId: 'cmid-hello there',
        body: 'hello there',
        author: { id: 'user-1', displayName: null },
        createdAt: '2026-01-01T00:00:00Z',
      });
    });
    await waitFor(() => expect(latestSocket().sendMessage).toHaveBeenCalledWith('hello there'));
  });

  it('marks a message failed on rejection and offers retry', async () => {
    const { findByLabelText, findByText } = await renderReady();
    await act(async () => {
      latestSocket().emitState('connected');
    });
    fireEvent.changeText(await findByLabelText('message'), 'spam attempt');
    fireEvent(await findByLabelText('message'), 'submitEditing');

    await act(async () => {
      latestSocket().emitRejected({ clientMessageId: 'cmid-spam attempt', code: 'rate_limited', retryAfter: 5 });
    });
    expect(await findByText("couldn't send · retry")).toBeTruthy();

    fireEvent.press(await findByText("couldn't send · retry"));
    expect(latestSocket().retryMessage).toHaveBeenCalledWith('cmid-spam attempt');
  });

  it('shows the terminal banned state with a support link instead of the composer', async () => {
    const { queryByLabelText, findByText } = await renderReady();
    await act(async () => {
      latestSocket().emitState('banned');
    });
    expect(await findByText('your account has been removed from community chat.')).toBeTruthy();
    expect(queryByLabelText('message')).toBeNull();
  });

  it('loads older history via the socket when "load older" is pressed', async () => {
    nextInitialHistoryPage = { messages: [], next_cursor: 'cursor-1' };
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });
    const { findByLabelText, findByText } = render(<CommunityScreen />);
    await findByLabelText('message');

    fireEvent.press(await findByText('load older'));
    await waitFor(() => expect(latestSocket().loadHistory).toHaveBeenCalledWith('cursor-1'));
  });
});

describe('CommunityScreen push opt-in prompt', () => {
  it('shows once, when permission is not yet granted and the prompt was never shown before', async () => {
    mockHasPushPermission.mockResolvedValue(false);
    mockHasShownPushOptInPrompt.mockResolvedValue(false);
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });

    const { findByText } = render(<CommunityScreen />);
    expect(await findByText('stay in the loop?')).toBeTruthy();
  });

  it('does not show if permission is already granted', async () => {
    mockHasPushPermission.mockResolvedValue(true);
    mockHasShownPushOptInPrompt.mockResolvedValue(false);
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });

    const { findByLabelText, queryByText } = render(<CommunityScreen />);
    await findByLabelText('message');
    expect(queryByText('stay in the loop?')).toBeNull();
  });

  it('does not show again once already shown before', async () => {
    mockHasPushPermission.mockResolvedValue(false);
    mockHasShownPushOptInPrompt.mockResolvedValue(true);
    mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER_IN_COMMUNITY) } });

    const { findByLabelText, queryByText } = render(<CommunityScreen />);
    await findByLabelText('message');
    expect(queryByText('stay in the loop?')).toBeNull();
  });
});
