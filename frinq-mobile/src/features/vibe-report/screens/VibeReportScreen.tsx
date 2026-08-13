import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { SummaryHeroCard } from '../components/SummaryHeroCard';
import { SummaryEnvelopeFlow } from '../components/SummaryEnvelopeFlow';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BootSplash } from '../../../navigation/placeholders';

const ENTER_EASING = Easing.bezier(0.22, 1, 0.36, 1);
/** Spacing of the background's vertical rules. 25, measured off the Figma
 *  frame (node 518:239): Line 41..57 sit at x = 1, 26, 51 ... 401 on a 402-wide
 *  canvas. */
const GRID_GAP = 25;

/** The four quick-read cards that follow the lead "your type" card, in order.
 *  Labels are the exact Page-2 design copy. */
const QUICK_ROWS = [
  { key: 'bring', label: 'you bring' },
  { key: 'notice', label: 'you notice' },
  { key: 'connect', label: 'you connect' },
  { key: 'care', label: 'you care' },
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
  const insets = useSafeAreaInsets();
  const { apiClient } = useSession();
  const reduced = useReducedMotion();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);

  const [reportMounted, setReportMounted] = useState(false);
  const [envelopeVisible, setEnvelopeVisible] = useState(true);
  const [ctaSize, setCtaSize] = useState({ width: 0, height: 0 });
  const [quoteSize, setQuoteSize] = useState({ width: 0, height: 0 });
  // Explicit pixel width AND margin, not percentage width + alignItems/
  // alignSelf centering: both resolved unpredictably through the
  // Animated.View + heroSection negative-margin wrapper chain above this
  // (once ~11% too wide and left-shifted, then still off-center even at the
  // right width). Computing both numbers directly and applying them as a
  // plain marginHorizontal sidesteps that chain's flex/percentage
  // resolution entirely.
  // The "bigger picture" reading paragraphs sitting flush against
  // scrollContent's own 24dp padding read as too tight against the edge —
  // 4% of the screen width extra, on top of that.
  const readingInset = windowWidth * 0.04;
  const heroContentWidth = windowWidth - spacing.xl * 2;
  const heroCardWidth = Math.min(heroContentWidth * 0.9, 360);
  const heroCardMargin = Math.max(0, (heroContentWidth - heroCardWidth) / 2);

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

  // The hero card is its own static plaque, not the first page of the
  // swipeable deck — see SummaryHeroCard's docstring. The deck itself only
  // holds the four quick-read cards below "what stands out about you".
  const cards: SummaryCard[] = useMemo(() => {
    if (!data) return [];
    return QUICK_ROWS.map(({ key, label }) => ({
      key,
      label,
      text: data.quickRows[key],
      shareCaption: `my frinq type is ${data.typeName}. ${data.quickRows[key]}`,
    }));
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
      {/* No 'bottom' edge: SafeAreaView's own bottom inset is padding
          outside every child, so nothing paints there — the maroon CTA
          block, meant to reach the true screen edge, stopped short of it
          with a bare gap in between. nextStep adds the inset itself. */}
      {reportMounted && (
        <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
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
            <View style={styles.heroSection}>
              <Animated.View style={headerStyle}>
                <BrandHeading variant="display" tone="brand" style={styles.wordmark}>frinq</BrandHeading>
                {/* Lowercase throughout — the design's editorial voice. Sans,
                    not Borel: the script face is reserved for the "frinq"
                    wordmark and small section headings, not body headlines. */}
                <BrandHeading variant="title" tone="brand" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.greeting}>
                  hey {(data.firstName || 'friend').toLowerCase()},
                </BrandHeading>
                <BodyText variant="intro" tone="secondary" style={styles.subcopy}>
                  here&apos;s your quick read.
                </BodyText>
              </Animated.View>

              <Animated.View style={[styles.hero, headerStyle, { marginHorizontal: heroCardMargin }]}>
                <SummaryHeroCard typeName={data.typeName} typeDefinition={data.typeDefinition} width={heroCardWidth} />
              </Animated.View>
            </View>

            <Animated.View style={[styles.deck, deckStyle]}>
              <BrandHeading variant="display" tone="brand" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.standsOut}>
                what stands out{`\n`}about you
              </BrandHeading>
              <SummaryCardStack cards={cards} onShare={handleShare} />
            </Animated.View>

            <Animated.View style={portraitStyle}>
              {!!data.detailedOpening && (
                <View
                  style={styles.pullQuote}
                  onLayout={(e) => setQuoteSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                >
                  {/* Explicit pixel size for the same reason as the CTA
                      gradient below: percentage-sized absoluteFill SVGs
                      inside a content-driven-height box measure short on
                      Android. */}
                  {quoteSize.height > 0 && (
                    <Svg style={StyleSheet.absoluteFill} width={quoteSize.width} height={quoteSize.height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Defs>
                        <LinearGradient id="pullQuote" x1="0" y1="0" x2="1" y2="0">
                          <Stop offset="0" stopColor={color.summary.quoteBoxBg} stopOpacity={1} />
                          <Stop offset="1" stopColor={color.summary.quoteBoxBgDeep} stopOpacity={1} />
                        </LinearGradient>
                      </Defs>
                      <Rect x={0} y={0} width={quoteSize.width} height={quoteSize.height} fill="url(#pullQuote)" />
                    </Svg>
                  )}
                  <BodyText style={styles.pullQuoteText}>{capitalize(data.detailedOpening)}</BodyText>
                </View>
              )}

              {/* Extra inset on top of scrollContent's own 24dp: the long
                  reading paragraphs sitting flush against that alone read as
                  too tight against the edge for a body-text measure. */}
              <BodyText style={{ ...styles.sectionLabel, paddingHorizontal: readingInset }}>the bigger picture</BodyText>
              {data.portrait.map((paragraph, i) => (
                <BodyText key={i} style={{ ...styles.paragraph, paddingHorizontal: readingInset }}>{capitalize(paragraph)}</BodyText>
              ))}
            </Animated.View>
            {/* Closing block, mirroring the web's "the next step" card — kept
                to one centered Continue rather than its two-button reserve/
                dismiss row: there's no reservation flow behind this app yet,
                so a single hand-off is the honest action.
                A plain View, not nested inside the Animated.View above (and
                without its own fade-in): a width wider than its container,
                from inside a Reanimated Animated.View, measured as if the
                extra width had no effect at all — the same class of bug as
                the hero card's percentage width, but this time even an
                explicit number inside that wrapper chain didn't survive it.
                Bleeding as a plain view avoids it entirely. */}
            <View
              style={[styles.nextStep, { width: windowWidth, marginLeft: -spacing.xl, paddingBottom: 34 + spacing.xxxl + insets.bottom }]}
              onLayout={(e) => setCtaSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
                {/* Explicit pixel width/height, not "100%": this box's height
                    is content-driven (the eyebrow/title/subcopy/button stack
                    it, no fixed height), and an absoluteFill SVG sized by
                    percentage inside an intrinsically-sized parent measured
                    smaller than the parent on Android — the gradient (and
                    its dark fill) stopped short of the real box, leaving the
                    subcopy sitting on the bare page background. */}
                {ctaSize.height > 0 && (
                  <Svg style={StyleSheet.absoluteFill} width={ctaSize.width} height={ctaSize.height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Defs>
                      <LinearGradient id="nextStep" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color.summary.nextStepTop} stopOpacity={0} />
                        <Stop offset="0.635" stopColor={color.summary.nextStepBottom} stopOpacity={1} />
                        <Stop offset="1" stopColor={color.summary.nextStepBottom} stopOpacity={1} />
                      </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={ctaSize.width} height={ctaSize.height} fill="url(#nextStep)" />
                  </Svg>
                )}
                <BodyText style={styles.nextStepEyebrow}>THE NEXT STEP</BodyText>
                <BrandHeading variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.nextStepTitle}>
                  want to meet people{`
`}this actually fits?
                </BrandHeading>
                {!!onContinue && (
                  <PrimaryButton label="Continue" onPress={onContinue} variant="secondary" style={styles.continueButton} />
                )}
              </View>
          </ScrollView>
        </SafeAreaView>
      )}

      {/* Overlays the report for its final beat, so the two crossfade. */}
      {envelopeVisible && (
        <View style={styles.envelopeOverlay}>
          <SummaryEnvelopeFlow
            firstName={data.firstName}
            typeName={data.typeName}
            typeDefinition={data.typeDefinition}
            onRevealStart={() => setReportMounted(true)}
            onRevealComplete={() => setEnvelopeVisible(false)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // White below the hero backdrop — heroSection paints its own maroon wash
  // over the top of this.
  fill: { flex: 1, backgroundColor: color.bg.box },
  envelopeOverlay: { ...StyleSheet.absoluteFill, zIndex: 100 },
  // No paddingBottom: nextStep is the last thing on the page and needs to
  // paint its maroon all the way to the bottom edge — its own paddingBottom
  // supplies the equivalent breathing room, inside the colored box instead
  // of as a bare-page-background gap after it.
  scrollContent: { paddingHorizontal: spacing.xl },
  // Bleeds full-width past scrollContent's own horizontal padding (negative
  // margin exactly cancels it), then reapplies the same inset for its
  // content so the wordmark/greeting/card line up exactly as before.
  heroSection: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.xl,
    backgroundColor: color.bg.canvas,
  },
  // Full-bleed to the bottom of the page — no radius, and paddingBottom
  // reaches past the safe-area inset so the maroon fill (not the bare page
  // background) is the last thing before the screen edge. Width/marginLeft
  // are applied inline as explicit pixel values (see the JSX) rather than
  // marginHorizontal here: a negative margin one level inside the
  // Animated.View wrapper above this measured as if it had no effect at
  // all, the same class of issue the hero card and heroSection bleed hit.
  nextStep: {
    marginTop: spacing.xxxl + spacing.xl,
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 34,
    // paddingBottom is set inline (see JSX) — it needs the device's actual
    // safe-area bottom inset added in.
  },
  nextStepEyebrow: { fontFamily: fontFamily.bodyMedium, fontSize: 11, letterSpacing: 1, color: color.summary.onNextStep },
  nextStepTitle: { marginTop: spacing.md, fontSize: 26, lineHeight: 34, textAlign: 'center', color: color.brand.cream },
  continueButton: { width: '100%', marginTop: spacing.xl },
  wordmark: { fontSize: 22, lineHeight: 34 },
  // Extra clearance below the heading: the back cards in the stack peek up
  // to 60dp above the front card (3 depths x 20dp) — a plain spacing.xl left
  // them crowding the heading text.
  standsOut: { fontSize: 24, lineHeight: 34, textAlign: 'center', marginBottom: spacing.xxxl + spacing.sm },
  greeting: { marginTop: spacing.sm, fontSize: 30, lineHeight: 38 },
  // Figma's second line is a lighter brown (#725f55, tone="secondary" already
  // resolves close to that), 16px.
  subcopy: { marginTop: spacing.xs, fontSize: 16 },
  hero: { marginTop: spacing.xxl },
  deck: { marginTop: spacing.xxxl + spacing.xl, marginBottom: spacing.xxxl },
  pullQuote: {
    marginTop: spacing.xxl,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderLeftWidth: 2,
    borderLeftColor: color.summary.quoteBorder,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  pullQuoteText: { fontFamily: fontFamily.bodyMedium, fontSize: 22, lineHeight: 30, color: color.summary.sealRed },
  // Figma: Motive (our Borel display face), #86201b, 13px — bumped to 15 for
  // real-device legibility; the reference's 13px is measured off a design
  // canvas, not a floor for actual body type.
  // Borel (fontFamily.display) is a script face whose loops overshoot a
  // normal line box in BOTH directions — the 'b'/'th' ascenders above and the
  // 'g'/'p' descenders below. At a default lineHeight "the bigger picture"
  // was cropped top and bottom. ~2x lineHeight plus explicit vertical padding
  // gives the glyphs their real room; same fix as the quiz's contextLine.
  sectionLabel: {
    marginTop: spacing.xxxl,
    fontFamily: fontFamily.display,
    fontSize: 15,
    lineHeight: 30,
    paddingTop: 6,
    paddingBottom: 6,
    color: color.summary.sealRed,
  },
  paragraph: { marginTop: spacing.md, fontSize: 15, lineHeight: 24, color: color.text.primary },
});
