import React, { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { PressableScale } from '../../../design/motion/PressableScale';
import { BodyText } from '../../../design/components/Text';
import { EmptyState } from '../../../design/components/EmptyState';
import { DisplayMessage } from '../communityMessageStore';
import { CommunityMessage } from './CommunityMessage';

type Props = {
  messages: DisplayMessage[];
  currentUserId: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onOpenActions: (message: DisplayMessage) => void;
};

/** Virtualized, inverted (newest-at-bottom) list — "stick to bottom on new
 *  message" and "prepend older without scroll jump" both come for free from
 *  FlatList's own inverted layout, rather than manual scroll-offset math. */
export function MessageList({ messages, currentUserId, hasMore, loadingOlder, onLoadOlder, onRetry, onOpenActions }: Props) {
  // FlatList `inverted` renders index 0 at the bottom — reverse so newest
  // (last in the oldest-first store) ends up at index 0.
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <FlatList
      data={reversed}
      inverted
      keyExtractor={(m) => m.clientMessageId}
      renderItem={({ item }) => (
        <CommunityMessage
          message={item}
          isOwn={currentUserId != null && item.authorId === currentUserId}
          onRetry={onRetry}
          onOpenActions={onOpenActions}
        />
      )}
      contentContainerStyle={styles.content}
      accessibilityRole="list"
      accessibilityLabel="messages"
      // Visually the TOP of the list (inverted) — where "load older" belongs.
      ListFooterComponent={
        hasMore ? (
          <PressableScale accessibilityRole="button" disabled={loadingOlder} onPress={onLoadOlder} style={styles.loadOlder}>
            <BodyText variant="overline" tone="secondary">{loadingOlder ? 'loading…' : 'load older'}</BodyText>
          </PressableScale>
        ) : null
      }
      ListEmptyComponent={!hasMore ? <EmptyState title="no messages yet" message="say hello." /> : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexGrow: 1 },
  loadOlder: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
});
