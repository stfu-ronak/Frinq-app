import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '../../../design/tokens/spacing';
import { Dialog } from '../../../design/components/Dialog';
import { BodyText } from '../../../design/components/Text';
import { ApiClient } from '../../../services/api/apiClient';
import { blockUser } from '../communityService';

type Props = {
  visible: boolean;
  apiClient: ApiClient;
  authorId: string | null;
  authorDisplayName: string | null;
  onClose: () => void;
  onBlocked: (authorId: string) => void;
};

export function BlockDialog({ visible, apiClient, authorId, authorDisplayName, onClose, onBlocked }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting || !authorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await blockUser(apiClient, authorId);
      onBlocked(authorId);
    } catch {
      setError("couldn't block, try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      visible={visible}
      title={`block ${authorDisplayName || 'this user'}?`}
      message="you won't see each other's messages in this community anymore. this takes effect immediately."
      onRequestClose={onClose}
      cancel={{ label: 'cancel', onPress: onClose }}
      confirm={{ label: submitting ? 'blocking…' : 'block', onPress: confirm }}
    >
      {!!error && (
        <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </BodyText>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: spacing.sm },
});
