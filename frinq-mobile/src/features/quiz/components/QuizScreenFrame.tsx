import React from 'react';
import { View } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { QuizHeader } from '../../../design/components/QuizHeader';
import { QuizProgress } from '../../../design/components/QuizProgress';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { stepProgress } from '../domain/quizDefinition';

type Props = {
  stepId: string;
  section: string;
  onBack?: () => void;
  showProgress?: boolean;
  children: React.ReactNode;
  /** Omit to hide the Continue bar entirely (e.g. single-select templates
   *  that advance immediately on selection). */
  continueLabel?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueBusy?: boolean;
};

/** Shared chrome for every quiz template: header, progress, scrollable
 *  content, and an optional Continue action. Templates own their own body;
 *  this owns layout/keyboard-avoidance/large-text scrolling consistently. */
export function QuizScreenFrame({
  stepId, section, onBack, showProgress = true, children,
  continueLabel, onContinue, continueDisabled, continueBusy,
}: Props) {
  const progress = stepProgress(stepId);
  return (
    <Screen scroll>
      <QuizHeader section={section} onBack={onBack} />
      {showProgress && progress.step > 0 && (
        <QuizProgress step={progress.step} total={progress.total} style={{ marginBottom: spacing.lg }} />
      )}
      <View style={{ flex: 1 }}>{children}</View>
      {continueLabel && onContinue && (
        <PrimaryButton
          label={continueLabel}
          onPress={onContinue}
          disabled={continueDisabled}
          busy={continueBusy}
          style={{ marginTop: spacing.xl, alignSelf: 'flex-start' }}
        />
      )}
    </Screen>
  );
}
