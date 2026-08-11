import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { ViewShotRef } from 'react-native-view-shot';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { spacing, radius } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { fontFamily } from '../../../design/tokens/typography';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { useSession } from '../../../services/session/sessionContext';
import { UserResponse } from '../../../services/api/contracts';
import { getEncryptedStore } from '../../../storage/encryptedStorage';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';
import { loadVibeReport } from '../vibeReportService';
import { toSummaryPageData } from '../summaryPageData';
import { shareVibeCard } from '../shareVibeCard';
import { SummaryCardStack, SummaryCard } from '../components/SummaryCardStack';
import { SummaryEnvelopeFlow } from '../components/SummaryEnvelopeFlow';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BootSplash } from '../../../navigation/placeholders';

const ENTER_EASING = Easing.bezier(0.22, 1, 0.36, 1);
/** Spacing of the background's vertical rules (design: 16-20px). */
const GRID_GAP = 18;

/** The four quick-read cards that follow the lead "your type" card, in order.
 *  Labels are the exact Page-2 design copy. */
const QUICK_ROWS = [
  { key: 'bring', label: 'what you bring to the table' },
  { key: 'notice', label: 'what you notice about people' },
  { key: 'connect', label: 'how you get close to people' },
  { key: 'care', label: 'what you care about in friendship' },
] as const;

function capitalize(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/**
 * The full summary: an envelope-opening moment, then the swipeable card deck
 * the envelope produced, then the long written portrait.
 *
 * Staged reveal — the envelope owns the whole first screen; the report mounts
 * underneath while the envelope's final beat is still playing (so there's no
 * blank frame between them), then the deck settles and the longer reading
 * fades in after it.
 */
type VibeReportScreenProps = {
  /** Supplied only on the FIRST view, straight after the quiz: renders a
   *  Continue button pinned to the bottom that hands off to the main app.
   *  Opening the same report later from Profile omits it — there's a back
   *  button there and nothing to continue to. */
  onContinue?: () => void;
};

export function VibeReportScreen({ onContinue }: VibeReportScreenProps = {}) {
  const { width: windowWidth } = useWindowDimensions();
  const { apiClient } = useSession();
  const reduced = useReducedMotion();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);

  const [reportMounted, setReportMounted] = useState(false);
  const [envelopeVisible, setEnvelopeVisible] = useState(true);

  const headerIn = useSharedValue(0);
  const deckIn = useSharedValue(0);
  const portraitIn = useSharedValue(0);

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
    return () => { cancelled = true; };
  }, [apiClient]);

  const query = useQuery({
    queryKey: ['quizSummary', submissionId],
    queryFn: () => loadVibeReport(apiClient, submissionId as string),
    enabled: !!submissionId,
  });

  useEffect(() => {
    if (!reportMounted) return;
    if (reduced) {
      headerIn.value = 1;
      deckIn.value = 1;
      portraitIn.value = 1;
      return;
    }
    headerIn.value = withTiming(1, { duration: 400, easing: ENTER_EASING });
    deckIn.value = withDelay(110, withTiming(1, { duration: 720, easing: ENTER_EASING }));
    // Let the deck land before the long reading arrives — makes the envelope a
    // beginning rather than a jump between two unrelated screens.
    portraitIn.value = withDelay(720, withTiming(1, { duration: 520, easing: ENTER_EASING }));
  }, [reportMounted, reduced, headerIn, deckIn, portraitIn]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerIn.value,
    transform: [{ translateY: (1 - headerIn.value) * -12 }],
  }));
  const deckStyle = useAnimatedStyle(() => ({
    opacity: deckIn.value,
    transform: [{ translateY: (1 - deckIn.value) * -86 }, { scale: 0.96 + deckIn.value * 0.04 }],
  }));
  const portraitStyle = useAnimatedStyle(() => ({
    opacity: portraitIn.value,
    transform: [{ translateY: (1 - portraitIn.value) * 28 }],
  }));

  const data = useMemo(
    () => (query.data && query.data.status === 'done' ? toSummaryPageData(query.data) : null),
    [query.data],
  );

  const cards: SummaryCard[] = useMemo(() => {
    if (!data) return [];
    return [
      { key: 'type', label: 'your type', title: data.typeName, text: data.typeDefinition, shareCaption: data.shareCaption },
      ...QUICK_ROWS.map(({ key, label }) => ({
        key,
        label,
        text: data.quickRows[key],
        shareCaption: `my frinq type is ${data.typeName}. ${data.quickRows[key]}`,
      })),
    ];
  }, [data]);

  const handleShare = useCallback(
    async (ref: React.RefObject<ViewShotRef | null>, card: SummaryCard) => {
      await shareVibeCard(ref, data?.typeName ?? 'Frinq', card.shareCaption);
    },
    [data],
  );

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
        message="Couldn't load your summary. Check your connection and try again."
        onRetry={() => query.refetch()}
      />
    );
  }
  if (!data) {
    return (
      <ErrorState
        title="Still on its way"
        message="Your summary isn't ready yet — check back in a moment."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <View style={styles.fill}>
      {reportMounted && (
        <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left', 'right']}>
          {/* Faint vertical rules behind everything — the design's ruled-paper
              ground. Spacing is fixed in dp (not a fraction of the width) so
              the texture reads the same on a 360dp phone and a 430dp one. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: Math.ceil(windowWidth / GRID_GAP) }, (_, i) => (
                <Rect key={i} x={i * GRID_GAP} y={0} width={StyleSheet.hairlineWidth} height="100%" fill={color.border.grid} />
              ))}
            </Svg>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Animated.View style={headerStyle}>
              {/* Masthead: wordmark left, field-note number right. */}
              <View style={styles.masthead}>
                <BrandHeading variant="display" tone="brand" style={styles.wordmark}>frinq</BrandHeading>
                <BodyText style={styles.fieldNote}>friend field note</BodyText>
              </View>
              {/* Lowercase throughout — the design's editorial voice. */}
              <BrandHeading variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.greeting}>
                hey {(data.firstName || 'friend').toLowerCase()},
              </BrandHeading>
              <BodyText variant="intro" tone="secondary" style={styles.subcopy}>
                here&apos;s your quick read.
              </BodyText>
            </Animated.View>

            <Animated.View style={[styles.deck, deckStyle]}>
              <BrandHeading variant="display" tone="brand" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.standsOut}>
                what stands out{`\n`}about you
              </BrandHeading>
              <SummaryCardStack cards={cards} onShare={handleShare} />
            </Animated.View>

            <Animated.View style={portraitStyle}>
              {!!data.detailedOpening && (
                <View style={styles.pullQuote}>
                  <BodyText style={styles.pullQuoteText}>{capitalize(data.detailedOpening)}</BodyText>
                </View>
              )}

              <BodyText style={styles.sectionLabel}>the bigger picture</BodyText>
              {data.portrait.map((paragraph, i) => (
                <View key={i}>
                  {i > 0 && <View style={styles.paragraphRule} />}
                  <BodyText style={styles.paragraph}>{capitalize(paragraph)}</BodyText>
                </View>
              ))}
              {/* Closing block, mirroring the web's "the next step" card —
                  minus its "reserve a seat … your details are already filled
                  in" copy and its two-button reserve/dismiss row. One
                  Continue, which is the only thing this app does next. */}
              <View style={styles.nextStep}>
                <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Defs>
                    <LinearGradient id="nextStep" x1="0" y1="0" x2="0.5" y2="1">
                      <Stop offset="0" stopColor={color.summary.nextStepTop} />
                      <Stop offset="0.55" stopColor={color.summary.nextStepMid} />
                      <Stop offset="1" stopColor={color.summary.nextStepBottom} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#nextStep)" />
                </Svg>
                <BodyText style={styles.nextStepEyebrow}>THE NEXT STEP</BodyText>
                <BrandHeading variant="title" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.nextStepTitle}>
                  want to meet people this actually fits?
                </BrandHeading>
                {!!onContinue && (
                  <PrimaryButton label="Continue" onPress={onContinue} variant="secondary" style={styles.continueButton} />
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      )}

      {/* Overlays the report for its final beat, so the two crossfade. */}
      {envelopeVisible && (
        <View style={styles.envelopeOverlay}>
          <SummaryEnvelopeFlow
            firstName={data.firstName}
            cards={cards}
            onRevealStart={() => setReportMounted(true)}
            onRevealComplete={() => setEnvelopeVisible(false)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.bg.canvas },
  envelopeOverlay: { ...StyleSheet.absoluteFill, zIndex: 100 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  nextStep: {
    marginTop: spacing.xxxl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 34,
  },
  nextStepEyebrow: { fontFamily: fontFamily.bodyMedium, fontSize: 11, letterSpacing: 1, color: color.summary.onNextStep },
  nextStepTitle: { marginTop: spacing.md, fontSize: 26, lineHeight: 34, textAlign: 'center', color: color.brand.cream },
  continueButton: { width: '100%', marginTop: spacing.xl },
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 22, lineHeight: 34 },
  fieldNote: { fontFamily: fontFamily.bodyLight, fontSize: 11, letterSpacing: 0.4, color: color.text.muted },
  standsOut: { fontSize: 24, lineHeight: 34, textAlign: 'center', marginBottom: spacing.xl },
  // lineHeight 38 under a 34px Borel cut the ascenders and the comma's tail.
  greeting: { marginTop: spacing.sm, fontSize: 34, lineHeight: 50 },
  subcopy: { marginTop: spacing.xs },
  deck: { marginTop: spacing.xxxl, marginBottom: spacing.xxxl },
  pullQuote: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderLeftWidth: 4,
    borderLeftColor: color.brand.maroon,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    backgroundColor: color.summary.quoteWash,
  },
  pullQuoteText: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 30, color: color.brand.maroon },
  sectionLabel: { marginTop: spacing.xxl, fontFamily: fontFamily.bodyMedium, fontSize: 12, letterSpacing: 1, color: color.text.secondary },
  paragraphRule: { width: 28, height: 1, marginVertical: spacing.lg, backgroundColor: color.border.subtle },
  paragraph: { marginTop: spacing.md, fontSize: 15, lineHeight: 26, color: color.text.primary },
});
