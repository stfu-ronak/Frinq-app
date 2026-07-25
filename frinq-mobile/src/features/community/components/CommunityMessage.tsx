import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { BodyText } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { DisplayMessage } from '../communityMessageStore';

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type Props = {
  message: DisplayMessage;
  isOwn: boolean;
  onRetry: (clientMessageId: string) => void;
  onOpenActions: (message: DisplayMessage) => void;
};

/** Plain text only — no HTML/Markdown/link-ification/images/reactions per
 *  the community-chat scope. Own-message accent uses the ownership token;
 *  actions (report/block) are exposed only on OTHER users' messages. */
export function CommunityMessage({ message, isOwn, onRetry, onOpenActions }: Props) {
  return (
    <View style={[styles.wrap, isOwn ? styles.own : styles.other]} accessibilityRole="none">
      {!isOwn && (
        <View style={styles.authorRow}>
          <BodyText variant="overline" tone="secondary">
            {message.authorDisplayName || 'someone'}
          </BodyText>
          {message.authorId != null && message.id != null && (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="message actions"
              onPress={() => onOpenActions(message)}
              style={styles.actionsButton}
            >
              <BodyText variant="overline" tone="secondary">•••</BodyText>
            </PressableScale>
          )}
        </View>
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, message.status === 'sending' && styles.sending]}>
        <BodyText variant="body" style={isOwn ? styles.textOwn : styles.textOther}>
          {message.body}
        </BodyText>
      </View>
      <View style={styles.metaRow}>
        <BodyText variant="caption" tone="secondary">
          {message.status === 'sending' ? 'sending…' : fmtTime(message.createdAt)}
        </BodyText>
        {message.status === 'failed' && (
          <PressableScale accessibilityRole="button" onPress={() => onRetry(message.clientMessageId)} style={styles.retryButton}>
            <BodyText variant="caption" tone="error">couldn't send · retry</BodyText>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '80%', marginVertical: spacing.xs, gap: spacing.xxs },
  own: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  other: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xxs },
  actionsButton: { minWidth: touchTarget.min, minHeight: touchTarget.min, justifyContent: 'center', alignItems: 'center' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleOwn: { backgroundColor: color.state.ownershipAccent },
  bubbleOther: { backgroundColor: color.bg.surface },
  sending: { opacity: 0.6 },
  textOwn: { color: color.text.onMaroon },
  textOther: { color: color.text.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxs },
  retryButton: { minHeight: touchTarget.min, justifyContent: 'center' },
});
