import React from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TextField } from '../../../../design/components/TextField';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { VoiceOrTextStep } from '../../domain/quizDefinition';
import { VoiceAnswer } from '../../components/VoiceAnswer';

type Props = {
  step: VoiceOrTextStep;
  submissionId: string;
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
};

/**
 * The design spec calls out voice/story as a "dedicated feature component"
 * rather than a generic registry template — this file already was one (its
 * own file, referenced by kind from the registry, not an inline template), so
 * Task 33 enhances it in place instead of adding a redundant StoryScreen.tsx.
 * The mic (VoiceAnswer) is additive: it uploads independently of the typed
 * answer and never affects Continue's validity, matching Task 31's original
 * text-only baseline contract.
 */
export function VoiceOrTextTemplate({ step, submissionId, value, onChange, onContinue, onBack }: Props) {
  const valid = value.trim().length > 0;
  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={onBack}
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      <BodyText variant="subheading" style={{ marginBottom: step.subtext ? spacing.xs : spacing.lg }}>
        {step.heading}
      </BodyText>
      {!!step.subtext && (
        <BodyText variant="body" tone="secondary" style={{ marginBottom: spacing.lg }}>
          {step.subtext}
        </BodyText>
      )}
      <VoiceAnswer submissionId={submissionId} questionKey={step.answerKey} />
      <TextField
        label={step.heading}
        hideLabel
        value={value}
        onChangeText={onChange}
        placeholder={step.placeholder}
        multiline
        numberOfLines={4}
      />
    </QuizScreenFrame>
  );
}
