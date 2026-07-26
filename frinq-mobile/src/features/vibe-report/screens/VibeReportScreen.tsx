import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { Screen } from '../../../design/components/Screen';
import { BodyText } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing, radius } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { UserResponse } from '../../../services/api/contracts';
import { getEncryptedStore } from '../../../storage/encryptedStorage';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';
import { loadVibeReport } from '../vibeReportService';
import { shareVibeCard } from '../shareVibeCard';
import { VibeCard } from '../components/VibeCard';
import { ReportSection } from '../components/ReportSection';
import { BootSplash } from '../../../navigation/placeholders';

/** The full Vibe report: card + editorial sections, in server-preserved
 *  order. Fetches via the same ['quizSummary', submissionId] query
 *  ProcessingScreen uses (same endpoint) — shares its cache (an instant
 *  render if you land here right after processing finishes) and gets
 *  offline/background pause for free from the app's existing
 *  focusManager/onlineManager bindings, same as every other query-backed
 *  screen. Reachable from Profile any time, per the design spec — not just
 *  right after processing. */
export function VibeReportScreen() {
  const { apiClient } = useSession();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<ViewShotRef>(null);

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
    queryFn: () => loadVibeReport(apiClient, submissionId as string),
    enabled: !!submissionId,
  });

  if (resolveFailed) {
    return (
      <ErrorState
        message="We couldn't find your session on this device. Try again, or reach support if this keeps happening."
        onRetry={() => query.refetch()}
      />
    );
  }

  if (query.isPending) return <BootSplash />;

  if (query.isError) {
    return (
      <ErrorState
        message="Couldn't load your Vibe report. Check your connection and try again."
        onRetry={() => query.refetch()}
      />
    );
  }

  const report = query.data;
  if (report.status !== 'done') {
    return (
      <ErrorState
        title="Still on its way"
        message="Your Vibe report isn't ready yet — check back in a moment."
        onRetry={() => query.refetch()}
      />
    );
  }

  const deep = report.deep_summary ?? undefined;
  const archetype = report.archetype ?? report.spirit_animal ?? null;
  const heroQuote = deep?.report_quote || report.headline || report.share_quote;

  async function handleShare() {
    setSharing(true);
    try {
      // Share the same quote shown as the hero — whatever the user just read.
      await shareVibeCard(shareCardRef, archetype ?? 'Frinq', heroQuote);
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen scroll>
      {/* Off-screen fixed-size, noninteractive composition captured for sharing. */}
      <View style={styles.hidden} pointerEvents="none">
        <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
          <VibeCard shareCard={report.share_card ?? null} fallbackArchetype={archetype} mode="share" />
        </ViewShot>
      </View>

      <VibeCard shareCard={report.share_card ?? null} fallbackArchetype={archetype} mode="onscreen" />
      <PrimaryButton
        label={sharing ? 'Sharing…' : 'Share your Vibe'}
        onPress={handleShare}
        busy={sharing}
        style={styles.shareButton}
      />

      {!!heroQuote && (
        <ReportSection>
          <BodyText variant="subheading" style={styles.centered}>
            &ldquo;{heroQuote}&rdquo;
          </BodyText>
        </ReportSection>
      )}

      {!!report.insights?.length && (
        <ReportSection title="what stood out">
          {report.insights.map((item, idx) => (
            <View key={idx} style={styles.pairRow}>
              <BodyText variant="bodyStrong">{item.label}</BodyText>
              <BodyText variant="body" tone="secondary">
                {item.text}
              </BodyText>
            </View>
          ))}
        </ReportSection>
      )}

      {!!deep?.narrative?.length && (
        <ReportSection title="the read">
          {deep.narrative.map((paragraph, idx) => (
            <BodyText key={idx} variant="body" style={styles.paragraph}>
              {paragraph}
            </BodyText>
          ))}
        </ReportSection>
      )}

      {(!!deep?.mirror || !!deep?.first_impression) && (
        <ReportSection title="how you land">
          {!!deep?.mirror && (
            <BodyText variant="body" style={styles.paragraph}>
              {deep.mirror}
            </BodyText>
          )}
          {!!deep?.first_impression && (
            <BodyText variant="body" style={styles.paragraph}>
              {deep.first_impression}
            </BodyText>
          )}
        </ReportSection>
      )}

      {(!!deep?.hidden_pattern || !!deep?.unspoken_need) && (
        <ReportSection title="underneath it">
          {!!deep?.hidden_pattern && (
            <BodyText variant="body" style={styles.paragraph}>
              {deep.hidden_pattern}
            </BodyText>
          )}
          {!!deep?.unspoken_need && (
            <BodyText variant="body" style={styles.paragraph}>
              {deep.unspoken_need}
            </BodyText>
          )}
        </ReportSection>
      )}

      {!!deep?.read_notes?.length && (
        <ReportSection title="worth noting">
          {deep.read_notes.map((note, idx) => (
            <View key={idx} style={styles.pairRow}>
              <BodyText variant="bodyStrong">{note.label}</BodyText>
              <BodyText variant="body" tone="secondary">
                {note.text}
              </BodyText>
            </View>
          ))}
        </ReportSection>
      )}

      {!!report.tags?.length && (
        <ReportSection title="tags">
          <View style={styles.tagsRow}>
            {report.tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <BodyText variant="caption">{tag}</BodyText>
              </View>
            ))}
          </View>
        </ReportSection>
      )}

      {!!deep?.snapshot && (
        <ReportSection title="snapshot">
          {(Object.entries(deep.snapshot) as [string, string | undefined][])
            .filter(([, value]) => !!value)
            .map(([key, value]) => (
              <View key={key} style={styles.pairRow}>
                <BodyText variant="caption" tone="secondary">
                  {key.replace(/_/g, ' ')}
                </BodyText>
                <BodyText variant="body">{value}</BodyText>
              </View>
            ))}
        </ReportSection>
      )}

      {!!deep?.closing_line && (
        <ReportSection>
          <BodyText variant="subheading" style={styles.centered}>
            {deep.closing_line}
          </BodyText>
        </ReportSection>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', top: -9999, left: 0 },
  shareButton: { marginTop: spacing.lg, marginBottom: spacing.xl, alignSelf: 'center' },
  centered: { textAlign: 'center' },
  paragraph: { marginBottom: spacing.sm },
  pairRow: { marginBottom: spacing.md },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: color.bg.surface },
});
