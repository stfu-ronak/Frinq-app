import { MessageOut } from '../../services/api/contracts';
import { RealtimeMessage } from '../../services/realtime/CommunitySocket';

/** Text-only. RN's Text component already escapes all content — no HTML,
 *  Markdown, link-ification, images, reactions, threads, typing, receipts,
 *  or presence, matching the web equivalent's DisplayMessage exactly. */
export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface DisplayMessage {
  clientMessageId: string;
  id: number | null;
  body: string;
  authorId: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  status: MessageStatus;
  failureCode?: string;
}

/** Cap the in-memory list — "load older" re-fetches from the server if the
 *  user scrolls back further than this (Phase 10 plan's approved bound).
 *  ponytail: if 300+ messages from others arrive while a local optimistic
 *  send is still unconfirmed, the cap could evict its bubble before the
 *  matching message.created/rejected frame arrives (same accepted gap as
 *  the web reference, frinq-frontend's community/page.tsx). Upgrade path if
 *  this ever bites: exempt 'sending' messages from the cap, or track them in
 *  a separate small map. */
export const MAX_MESSAGES_IN_MEMORY = 300;

function cap(messages: DisplayMessage[]): DisplayMessage[] {
  return messages.length > MAX_MESSAGES_IN_MEMORY
    ? messages.slice(messages.length - MAX_MESSAGES_IN_MEMORY)
    : messages;
}

function fromHistory(m: MessageOut): DisplayMessage {
  return {
    id: m.id,
    clientMessageId: m.client_message_id,
    body: m.body,
    authorId: m.author.id,
    authorDisplayName: m.author.display_name ?? null,
    createdAt: m.created_at,
    status: 'sent',
  };
}

/** Initial history load — backend returns newest-first already reversed to
 *  oldest-first (communities.py's `visible.reverse()`), so this just maps. */
export function setInitialHistory(page: MessageOut[]): DisplayMessage[] {
  return page.map(fromHistory);
}

/** "Load older" — prepend an older page before the current oldest message. */
export function prependOlderHistory(current: DisplayMessage[], olderPage: MessageOut[]): DisplayMessage[] {
  return [...olderPage.map(fromHistory), ...current];
}

/** A local send, rendered immediately as 'sending' before any server confirmation. */
export function addOptimisticMessage(
  current: DisplayMessage[],
  clientMessageId: string,
  body: string,
  authorId: string | null,
): DisplayMessage[] {
  return cap([
    ...current,
    {
      id: null,
      clientMessageId,
      body,
      authorId,
      authorDisplayName: null,
      createdAt: new Date().toISOString(),
      status: 'sending',
    },
  ]);
}

/** A confirmed message.created frame — replaces the matching optimistic
 *  entry in place (by clientMessageId) if present, otherwise appends (a
 *  message from someone else). De-dupes an out-of-order/duplicate frame:
 *  replacing in place rather than always appending means a frame that
 *  arrives twice for the same clientMessageId just overwrites itself. */
export function reconcileIncoming(current: DisplayMessage[], incoming: RealtimeMessage): DisplayMessage[] {
  const resolved: DisplayMessage = {
    id: incoming.id,
    clientMessageId: incoming.clientMessageId,
    body: incoming.body,
    authorId: incoming.author.id,
    authorDisplayName: incoming.author.displayName,
    createdAt: incoming.createdAt,
    status: 'sent',
  };
  const idx = current.findIndex((m) => m.clientMessageId === incoming.clientMessageId);
  const next = idx >= 0 ? current.map((m, i) => (i === idx ? resolved : m)) : [...current, resolved];
  return cap(next);
}

export function markFailed(current: DisplayMessage[], clientMessageId: string, failureCode: string): DisplayMessage[] {
  return current.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'failed', failureCode } : m));
}

export function markRetrying(current: DisplayMessage[], clientMessageId: string): DisplayMessage[] {
  return current.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: 'sending' } : m));
}

/** Block takes effect immediately — don't wait for a history refetch (the
 *  server already excludes this author from future history reads). */
export function removeMessagesFromAuthor(current: DisplayMessage[], authorId: string): DisplayMessage[] {
  return current.filter((m) => m.authorId !== authorId);
}
