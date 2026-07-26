import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { UserResponse } from '../../../services/api/contracts';
import { getEncryptedStore } from '../../../storage/encryptedStorage';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';
import { fetchQuizSummary, retryQuiz } from '../../quiz/quizSyncService';

// Exponential backoff, capped at 30s. Query pauses entirely while backgrounded
// (focusManager) or offline (onlineManager) — both already bound in App.tsx —
// so this never spins in a background tab.
const POLL_STEPS_MS = [2000, 4000, 8000, 16000, 30000];

interface Props {
  /** Re-runs boot resolution (server-authoritative). Called once the job
   *  reaches a terminal 'done' status — never a client-side success guess. */
  onComplete: () => void;
}

/** Building-your-vibe screen shown while onboarding_state === 'profile_processing'.
 *  The submission id survives here via the same encrypted quiz draft Task 32
 *  already persists (not cleared on finalize) — that's what makes this durable
 *  across app restart/process death with no new storage mechanism needed. */
export function ProcessingScreen({ onComplete }: Props) {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await apiClient.request<UserResponse>({ path: '/api/v1/users/me' });
      const store = await getEncryptedStore();
      const repo = new QuizDraftRepository({ store, now: () => Date.now() });
      const draft = repo.load(user.id);
      if (cancelled) return;
      if (draft) setSubmissionId(draft.submissionId);
      else setResolveFailed(true);
    })().catch(() => {
      if (!cancelled) setResolveFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const query = useQuery({
    queryKey: ['quizSummary', submissionId],
    queryFn: () => fetchQuizSummary(apiClient, submissionId as string),
    enabled: !!submissionId,
    retry: false,
    refetchInterval: (q) => {
      // On error `data` is undefined, so without this the poll falls through to
      // POLL_STEPS_MS[0] and hammers a failing endpoint every 2s forever. The
      // ErrorState below already offers a manual retry — stop auto-polling and
      // let the user drive it.
      if (q.state.status === 'error') return false;
      const status = q.state.data?.status;
      if (status && status !== 'pending' && status !== 'processing') return false;
      const step = Math.min(q.state.dataUpdateCount, POLL_STEPS_MS.length - 1);
      return POLL_STEPS_MS[step];
    },
  });

  useEffect(() => {
    if (query.data?.status === 'done') onComplete();
  }, [query.data?.status, onComplete]);

  if (resolveFailed) {
    return (
      <ErrorState
        message="We couldn't find your session on this device. Try again, or reach support if this keeps happening."
        onRetry={onComplete}
      />
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message="Couldn't check on your Vibe report. Check your connection and try again."
        onRetry={() => query.refetch()}
      />
    );
  }

  if (query.data?.status === 'error') {
    return (
      <ErrorState
        title="Couldn't finish your vibe report"
        message="Something went wrong generating your results. You can try again."
        retrying={retrying}
        onRetry={async () => {
          if (!submissionId) return;
          setRetrying(true);
          try {
            await retryQuiz(apiClient, submissionId);
            await queryClient.invalidateQueries({ queryKey: ['quizSummary', submissionId] });
          } finally {
            setRetrying(false);
          }
        }}
      />
    );
  }

  return (
    <Screen>
      <View style={styles.center} testID="screen-processing">
        <ActivityIndicator size="large" color={color.state.selected} />
        <BrandHeading variant="title" style={styles.heading}>
          Building your vibe…
        </BrandHeading>
        <BodyText variant="body" tone="secondary" style={styles.note}>
          This usually takes a moment. Feel free to leave the app — we'll pick up right where we left off.
        </BodyText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { marginTop: spacing.lg, textAlign: 'center' },
  note: { marginTop: spacing.sm, textAlign: 'center' },
});
