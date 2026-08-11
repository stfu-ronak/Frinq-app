import React from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QuizHeader } from '../../../design/components/QuizHeader';
import { NextArrowButton } from '../../../design/components/NextArrowButton';
import { color } from '../../../design/tokens/colors';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { stepProgress } from '../domain/quizDefinition';

type Props = {
  stepId: string;
  onBack?: () => void;
  /** 'counter' = every quiz-proper question (Rapid Fire, Opinions,
   *  Voice/Text, Preferences/slider): "Question N out of Total". 'glow'/
   *  'plain' both show no counter — 'glow' names the "who you are"-style
   *  MCQ screens for future reference even though the Ellipse-40 wash itself
   *  has been removed; 'plain' names the milestone/break screens (Figma node
   *  163:2026), which sit outside stepProgress's count entirely. Always
   *  pass one explicitly rather than relying on a guessable default. */
  headerVariant: 'glow' | 'counter' | 'plain';
  /** 'cream' (default): the usual quiz chrome. 'maroon': full-bleed maroon
   *  background, white back-arrow/wave/text — same back-arrow and footer
   *  POSITION as every other quiz screen (this is still QuizScreenFrame),
   *  only the colors invert. Used by milestone/break screens that opt into
   *  IntroStep's `theme: 'maroon'`. */
  theme?: 'cream' | 'maroon';
  /** 0-based sub-item index for a step whose screen re-renders per sub-part
   *  (Rapid Fire's pairs) — shifts the counter within that one step id. */
  subIndex?: number;
  children: React.ReactNode;
  /** Rendered above the ScrollView (fixed, doesn't scroll with `children`) —
   *  e.g. a question's heading, so a long option list scrolls underneath it
   *  instead of carrying it off-screen. Same horizontal padding/max-width as
   *  the scrolling content, so it lines up with it. */
  aboveScroll?: React.ReactNode;
  /** Rendered below the ScrollView, above the footer (fixed) — e.g. a
   *  "describe your own"-style text field that should stay put next to the
   *  Next control rather than scroll away with the option list. */
  belowScroll?: React.ReactNode;
  /** Omit both continueLabel and footer to hide the footer entirely (e.g.
   *  single-select templates that advance immediately on selection). */
  continueLabel?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueBusy?: boolean;
  /** Custom footer content, rendered in the same fixed bottom slot as the
   *  Next-arrow pill instead of it — Rapid Fire's plain text "Next" link is
   *  the one consumer, so it still sits at the exact same height as every
   *  other question's Next control. Takes precedence over continueLabel. */
  footer?: React.ReactNode;
};

/** Shared chrome for every quiz template: a FIXED header (back arrow +
 *  counter + wave) and FIXED footer (the Next-arrow pill, or a custom
 *  `footer`), with only the body content scrolling between them — so
 *  neither chrome piece moves regardless of how much a question's
 *  content/options take up (Figma node 163:1497, "what are you looking
 *  for?", has many tag options that scroll inside a fixed-height list while
 *  the header/Next stay put). */
export function QuizScreenFrame({
  stepId, onBack, headerVariant, theme = 'cream', subIndex, children, aboveScroll, belowScroll,
  continueLabel, onContinue, continueDisabled, continueBusy, footer,
}: Props) {
  const progress = stepProgress(stepId, subIndex);
  // Every real quiz question shows the counter now, in the same spot,
  // regardless of headerVariant — only 'plain' (milestone/break screens) and
  // anything stepProgress doesn't recognize as a counted content step (the
  // pre-quiz onboarding basics: gender/pronoun/city/age/social verification,
  // which route through here with a non-'plain' variant too but aren't part
  // of the quiz's own count) stay silent.
  const counterLabel = headerVariant !== 'plain' && progress.step > 0 ? `Question ${progress.step} out of ${progress.total}` : undefined;
  // Derived from the SAME stepProgress the counter uses, so the wave and the
  // "N out of M" text can never disagree. Milestone/break screens ('plain',
  // or anything stepProgress doesn't count) get no bar at all.
  // NOT gated on counterLabel: the milestone/break screens between sections
  // ('plain' header, no counter text) still sit at a real point in the run, so
  // the wave keeps the fill it had rather than resetting to an empty track.
  const waveProgress = progress.total > 0 && progress.step > 0 ? progress.step / progress.total : undefined;
  const maroon = theme === 'maroon';

  return (
    <SafeAreaView style={[styles.fill, maroon && styles.fillMaroon]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle={maroon ? 'light-content' : 'dark-content'} backgroundColor={maroon ? color.bg.milestone : color.bg.canvas} />
      <QuizHeader onBack={onBack} counterLabel={counterLabel} tone={theme} progress={waveProgress} />
      {!!aboveScroll && <View style={styles.aboveScroll}>{aboveScroll}</View>}
      <ScrollView
        style={styles.scroll}
        // With an aboveScroll header the top padding is already spent there;
        // adding it again here pushed those screens' first option 16dp lower
        // than the same option on a screen whose heading scrolls with the body.
        contentContainerStyle={[styles.scrollContent, !!aboveScroll && styles.scrollContentUnderHeader]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        alwaysBounceVertical={false}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
      {!!belowScroll && <View style={styles.belowScroll}>{belowScroll}</View>}
      {!!footer ? (
        <View style={styles.footer}>{footer}</View>
      ) : (
        !!continueLabel && !!onContinue && (
          <View style={styles.footer}>
            <NextArrowButton accessibilityLabel={continueLabel} onPress={onContinue} disabled={continueDisabled} busy={continueBusy} />
          </View>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.bg.canvas },
  fillMaroon: { backgroundColor: color.bg.milestone },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  scrollContentUnderHeader: { paddingTop: 0 },
  inner: { width: '100%', maxWidth: 520, flex: 1 },
  aboveScroll: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  belowScroll: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.xl },
  // Matches ReferenceCtaFooter's bottom offset (content padding + the
  // reserved secondary-link slot) so every Next/Continue control across
  // auth, quiz, and break screens sits at the same height. The +29/-29 split
  // (5px, then +10% of footer height, then +10px) nudges the button lower
  // without changing the footer's total height (so the bottom safe-area math
  // above stays untouched).
  footer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm + 29,
    paddingBottom: spacing.xl + touchTarget.min + spacing.lg - 29,
  },
});
