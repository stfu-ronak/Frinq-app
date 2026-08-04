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
  children: React.ReactNode;
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
  stepId, onBack, headerVariant, children,
  continueLabel, onContinue, continueDisabled, continueBusy, footer,
}: Props) {
  const progress = stepProgress(stepId);
  const counterLabel = headerVariant === 'counter' ? `Question ${progress.step} out of ${progress.total}` : undefined;

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={color.bg.canvas} />
      <QuizHeader onBack={onBack} counterLabel={counterLabel} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        alwaysBounceVertical={false}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  inner: { width: '100%', maxWidth: 520, flex: 1 },
  // Matches ReferenceCtaFooter's bottom offset (content padding + the
  // reserved secondary-link slot) so every Next/Continue control across
  // auth, quiz, and break screens sits at the same height.
  footer: { width: '100%', alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xl + touchTarget.min + spacing.lg },
});
