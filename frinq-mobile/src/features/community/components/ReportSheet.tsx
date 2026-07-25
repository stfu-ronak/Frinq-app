import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../../../design/tokens/spacing';
import { Sheet } from '../../../design/components/Sheet';
import { ChoiceListRow } from '../../../design/components/ChoiceListRow';
import { TextField } from '../../../design/components/TextField';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BodyText } from '../../../design/components/Text';
import { ApiClient } from '../../../services/api/apiClient';
import { REPORT_REASON_LABELS, ReportReason, reportMessage } from '../communityService';

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

type Props = {
  visible: boolean;
  apiClient: ApiClient;
  messageId: number | null;
  onClose: () => void;
};

/** Reason + optional details, idempotent submit, neutral acknowledgement —
 *  never promises a specific enforcement outcome. */
export function ReportSheet({ visible, apiClient, messageId, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason(null);
    setDetails('');
    setSubmitting(false);
    setDone(false);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (!reason || submitting || messageId == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportMessage(apiClient, messageId, reason, details);
      setDone(true);
    } catch {
      setError("couldn't submit report, try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={done ? 'report sent' : 'report message'}>
      {done ? (
        <View>
          <BodyText variant="body" tone="secondary" style={styles.doneText}>
            thanks — we've received your report and will look into it.
          </BodyText>
          <PrimaryButton label="close" onPress={close} />
        </View>
      ) : (
        <View>
          <View style={styles.reasons}>
            {REASONS.map((r) => (
              <ChoiceListRow key={r} label={REPORT_REASON_LABELS[r]} selected={reason === r} onPress={() => setReason(r)} style={styles.reasonRow} />
            ))}
          </View>
          <TextField
            label="additional details (optional)"
            value={details}
            onChangeText={setDetails}
            maxLength={500}
            multiline
            containerStyle={styles.details}
          />
          {!!error && (
            <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </BodyText>
          )}
          <PrimaryButton label={submitting ? 'submitting…' : 'submit'} busy={submitting} disabled={!reason} onPress={submit} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.sm, marginBottom: spacing.lg },
  reasonRow: { marginBottom: 0 },
  details: { marginBottom: spacing.lg },
  error: { marginBottom: spacing.md },
  doneText: { marginBottom: spacing.lg },
});
