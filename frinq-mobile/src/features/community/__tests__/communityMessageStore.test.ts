import {
  MAX_MESSAGES_IN_MEMORY,
  addOptimisticMessage,
  markFailed,
  markRetrying,
  prependOlderHistory,
  reconcileIncoming,
  removeMessagesFromAuthor,
  setInitialHistory,
} from '../communityMessageStore';
import { MessageOut } from '../../../services/api/contracts';
import { RealtimeMessage } from '../../../services/realtime/CommunitySocket';

function historyMsg(overrides: Partial<MessageOut> = {}): MessageOut {
  return {
    id: 1,
    client_message_id: 'cmid-1',
    body: 'hello',
    created_at: '2026-01-01T00:00:00Z',
    author: { id: 'u1', display_name: 'Alice' },
    ...overrides,
  };
}

describe('setInitialHistory', () => {
  it('maps backend messages to DisplayMessage with status sent', () => {
    const result = setInitialHistory([historyMsg()]);
    expect(result).toEqual([
      { id: 1, clientMessageId: 'cmid-1', body: 'hello', authorId: 'u1', authorDisplayName: 'Alice', createdAt: '2026-01-01T00:00:00Z', status: 'sent' },
    ]);
  });

  it('falls back to null authorDisplayName when the backend sends none', () => {
    const result = setInitialHistory([historyMsg({ author: { id: 'u1', display_name: null } })]);
    expect(result[0].authorDisplayName).toBeNull();
  });
});

describe('prependOlderHistory', () => {
  it('prepends an older page before the current oldest message, preserving order', () => {
    const current = setInitialHistory([historyMsg({ id: 2, client_message_id: 'cmid-2' })]);
    const older = [historyMsg({ id: 1, client_message_id: 'cmid-1' })];
    const result = prependOlderHistory(current, older);
    expect(result.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe('addOptimisticMessage', () => {
  it('appends a sending-status message with no server id yet', () => {
    const result = addOptimisticMessage([], 'cmid-new', 'hi there', 'u1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: null, clientMessageId: 'cmid-new', body: 'hi there', authorId: 'u1', status: 'sending' });
  });

  it('caps the list at MAX_MESSAGES_IN_MEMORY, dropping the oldest', () => {
    const full = Array.from({ length: MAX_MESSAGES_IN_MEMORY }, (_, i) =>
      setInitialHistory([historyMsg({ id: i, client_message_id: `c${i}` })])[0],
    );
    const result = addOptimisticMessage(full, 'new-one', 'hi', 'u1');
    expect(result).toHaveLength(MAX_MESSAGES_IN_MEMORY);
    expect(result[result.length - 1].clientMessageId).toBe('new-one');
    expect(result.some((m) => m.clientMessageId === 'c0')).toBe(false); // oldest dropped
  });
});

describe('reconcileIncoming', () => {
  function realtime(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
    return { id: 5, clientMessageId: 'cmid-opt', body: 'sent for real', author: { id: 'u1', displayName: 'Alice' }, createdAt: '2026-01-01T00:01:00Z', ...overrides };
  }

  it('replaces a matching optimistic (sending) entry in place, marking it sent', () => {
    const optimistic = addOptimisticMessage([], 'cmid-opt', 'sent for real', 'u1');
    const result = reconcileIncoming(optimistic, realtime());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 5, status: 'sent', authorDisplayName: 'Alice' });
  });

  it('appends a new message from another user when there is no matching optimistic entry', () => {
    const result = reconcileIncoming([], realtime({ clientMessageId: 'someone-elses', author: { id: 'u2', displayName: 'Bob' } }));
    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe('u2');
  });

  it('a duplicate/out-of-order frame for the same clientMessageId overwrites in place rather than duplicating', () => {
    const first = reconcileIncoming([], realtime());
    const again = reconcileIncoming(first, realtime()); // same frame delivered twice
    expect(again).toHaveLength(1);
  });

  it('caps at MAX_MESSAGES_IN_MEMORY when appending a brand-new message', () => {
    const full = Array.from({ length: MAX_MESSAGES_IN_MEMORY }, (_, i) =>
      setInitialHistory([historyMsg({ id: i, client_message_id: `c${i}` })])[0],
    );
    const result = reconcileIncoming(full, realtime({ clientMessageId: 'brand-new' }));
    expect(result).toHaveLength(MAX_MESSAGES_IN_MEMORY);
    expect(result.some((m) => m.clientMessageId === 'c0')).toBe(false);
  });
});

describe('markFailed / markRetrying', () => {
  it('marks the matching message failed with a code, leaves others untouched', () => {
    const messages = addOptimisticMessage([], 'cmid-1', 'hi', 'u1');
    const result = markFailed(messages, 'cmid-1', 'rate_limited');
    expect(result[0]).toMatchObject({ status: 'failed', failureCode: 'rate_limited' });
  });

  it('marks a failed message back to sending on retry', () => {
    const failed = markFailed(addOptimisticMessage([], 'cmid-1', 'hi', 'u1'), 'cmid-1', 'rate_limited');
    const result = markRetrying(failed, 'cmid-1');
    expect(result[0].status).toBe('sending');
  });
});

describe('removeMessagesFromAuthor', () => {
  it('removes every message from the blocked author, keeps others', () => {
    const messages = [
      ...setInitialHistory([historyMsg({ id: 1, client_message_id: 'c1', author: { id: 'blocked-user', display_name: 'X' } })]),
      ...setInitialHistory([historyMsg({ id: 2, client_message_id: 'c2', author: { id: 'other-user', display_name: 'Y' } })]),
    ];
    const result = removeMessagesFromAuthor(messages, 'blocked-user');
    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe('other-user');
  });
});
