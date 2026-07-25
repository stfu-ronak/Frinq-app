import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { EmptyState } from '../../../design/components/EmptyState';
import { ErrorState } from '../../../design/components/ErrorState';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { spacing } from '../../../design/tokens/spacing';
import { BootSplash } from '../../../navigation/placeholders';
import { useSession } from '../../../services/session/sessionContext';
import { WEB_BASE_URL } from '../../../services/api/config';
import { fetchProfile } from '../../profile/profileService';
import { track } from '../../../services/telemetry/analytics';
import { CommunitySocket, RealtimeMessage, RealtimeRejection } from '../../../services/realtime/CommunitySocket';
import { ConnectionState } from '../../../services/realtime/realtimeMachine';
import {
  DisplayMessage,
  addOptimisticMessage,
  markFailed,
  markRetrying,
  prependOlderHistory,
  reconcileIncoming,
  removeMessagesFromAuthor,
  setInitialHistory,
} from '../communityMessageStore';
import { CommunityHeader } from '../components/CommunityHeader';
import { MessageList } from '../components/MessageList';
import { MessageComposer } from '../components/MessageComposer';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { ReportSheet } from '../components/ReportSheet';
import { BlockDialog } from '../components/BlockDialog';
import { PushOptInPrompt } from '../components/PushOptInPrompt';
import { hasPushPermission, hasShownPushOptInPrompt } from '../../../services/push/pushService';

type ViewState = 'loading' | 'ready' | 'noMembership' | 'offline';

const TERMINAL_STATES: ReadonlySet<ConnectionState> = new Set(['suspended', 'banned', 'authExpired']);

const TERMINAL_COPY: Partial<Record<ConnectionState, string>> = {
  authExpired: 'your session expired — sign in again to keep chatting.',
  suspended: 'your account is temporarily suspended from chat.',
  banned: 'your account has been removed from community chat.',
};

export function CommunityScreen() {
  const { apiClient } = useSession();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const user = await fetchProfile(apiClient);
      if (user.community_slug) {
        setCommunitySlug(user.community_slug);
        setUserId(user.id);
        setViewState('ready');
        track('community_opened');
      } else {
        setViewState('noMembership');
      }
    } catch {
      setViewState('offline');
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View testID="screen-community" style={styles.fill}>
      {viewState === 'loading' && <BootSplash />}
      {viewState === 'offline' && (
        <Screen>
          <ErrorState message="couldn't load your community." onRetry={load} />
        </Screen>
      )}
      {viewState === 'noMembership' && (
        <Screen>
          <EmptyState title="no community assigned yet" message="check back soon — we'll place you once your profile is ready." />
        </Screen>
      )}
      {viewState === 'ready' && <ChatView communitySlug={communitySlug!} userId={userId} />}
    </View>
  );
}

function ChatView({ communitySlug, userId }: { communitySlug: string; userId: string | null }) {
  const { apiClient } = useSession();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [actionsFor, setActionsFor] = useState<DisplayMessage | null>(null);
  const [reportTarget, setReportTarget] = useState<number | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  const socketRef = useRef<CommunitySocket | null>(null);
  if (!socketRef.current) socketRef.current = new CommunitySocket(apiClient);
  const socket = socketRef.current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await socket.loadHistory();
        if (cancelled) return;
        setMessages(setInitialHistory(page.messages));
        setNextCursor(page.next_cursor ?? null);
      } catch {
        // Non-fatal — realtime can still connect; user starts with an empty
        // scrollback for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubState = socket.onStateChange(setConnectionState);
    const unsubMessage = socket.onMessage((m: RealtimeMessage) => {
      setMessages((prev) => reconcileIncoming(prev, m));
    });
    const unsubRejected = socket.onRejected((r: RealtimeRejection) => {
      setMessages((prev) => markFailed(prev, r.clientMessageId, r.code));
    });

    void socket.connect();
    return () => {
      unsubState();
      unsubMessage();
      unsubRejected();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [granted, shown] = await Promise.all([hasPushPermission(), hasShownPushOptInPrompt()]);
      if (!cancelled && !granted && !shown) setShowPushPrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSend(body: string) {
    const clientMessageId = socket.sendMessage(body);
    track('message_sent');
    setMessages((prev) => addOptimisticMessage(prev, clientMessageId, body, userId));
  }

  function handleRetry(clientMessageId: string) {
    setMessages((prev) => markRetrying(prev, clientMessageId));
    socket.retryMessage(clientMessageId);
  }

  function handleBlocked(authorId: string) {
    setMessages((prev) => removeMessagesFromAuthor(prev, authorId));
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await socket.loadHistory(nextCursor);
      setMessages((prev) => prependOlderHistory(prev, page.messages));
      setNextCursor(page.next_cursor ?? null);
    } catch {
      // Leave nextCursor as-is — the user can tap "load older" again.
    } finally {
      setLoadingOlder(false);
    }
  }

  const terminal = TERMINAL_STATES.has(connectionState);
  const composerDisabled = connectionState !== 'connected';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.fill}>
        <CommunityHeader communitySlug={communitySlug} connectionState={connectionState} />
        {terminal ? (
          <View style={styles.terminalWrap} accessible accessibilityRole="alert">
            <BrandHeading variant="heading" style={styles.terminalTitle}>chat unavailable</BrandHeading>
            <BodyText variant="body" tone="secondary" style={styles.terminalMessage}>
              {TERMINAL_COPY[connectionState] ?? ''}
            </BodyText>
            <PrimaryButton label="contact support" onPress={() => Linking.openURL(`${WEB_BASE_URL}/support`)} />
          </View>
        ) : (
          <>
            <MessageList
              messages={messages}
              currentUserId={userId}
              hasMore={nextCursor != null}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlder}
              onRetry={handleRetry}
              onOpenActions={setActionsFor}
            />
            <MessageComposer onSend={handleSend} disabled={composerDisabled} />
          </>
        )}
      </View>

      <MessageActionSheet
        visible={actionsFor != null}
        onClose={() => setActionsFor(null)}
        onReport={() => {
          setReportTarget(actionsFor?.id ?? null);
          setActionsFor(null);
        }}
        onBlock={() => {
          if (actionsFor) setBlockTarget({ id: actionsFor.authorId!, name: actionsFor.authorDisplayName });
          setActionsFor(null);
        }}
      />
      <ReportSheet visible={reportTarget != null} apiClient={apiClient} messageId={reportTarget} onClose={() => setReportTarget(null)} />
      <BlockDialog
        visible={blockTarget != null}
        apiClient={apiClient}
        authorId={blockTarget?.id ?? null}
        authorDisplayName={blockTarget?.name ?? null}
        onClose={() => setBlockTarget(null)}
        onBlocked={(id) => {
          handleBlocked(id);
          setBlockTarget(null);
        }}
      />
      <PushOptInPrompt visible={showPushPrompt} apiClient={apiClient} onDone={() => setShowPushPrompt(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  terminalWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  terminalTitle: { textAlign: 'center' },
  terminalMessage: { textAlign: 'center', marginBottom: spacing.md },
});
