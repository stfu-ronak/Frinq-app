import React from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TagPicker } from '../../../../design/components/TagPicker';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { MultiChoiceTagsStep } from '../../domain/quizDefinition';
import { validateMultiChoice } from '../../domain/answerSchema';

type Props = {
  step: MultiChoiceTagsStep;
  value: string[];
  onChange: (v: string[]) => void;
  onContinue: () => void;
  onBack?: () => void;
};

export function MultiChoiceTagsTemplate({ step, value, onChange, onContinue, onBack }: Props) {
  const valid = validateMultiChoice(value, { min: step.min, max: step.max }).valid;
  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={onBack}
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      <BodyText variant="subheading" style={{ marginBottom: spacing.sm }}>
        {step.prompt}
      </BodyText>
      {!!step.subtext && (
        <BodyText variant="caption" tone="secondary" style={{ marginBottom: spacing.lg }}>
          {step.subtext}
        </BodyText>
      )}
      <TagPicker options={step.options} selected={value} onChange={onChange} max={step.max} />
    </QuizScreenFrame>
  );
}
