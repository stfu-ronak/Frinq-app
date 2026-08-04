import React from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { SimpleStepFrame } from '../../components/SimpleStepFrame';
import { TextField } from '../../../../design/components/TextField';
import { TextStep } from '../../domain/quizDefinition';
import { validateText } from '../../domain/answerSchema';

type Props = {
  step: TextStep;
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
};

export function TextInputTemplate({ step, value, onChange, onContinue, onBack }: Props) {
  const valid = validateText(value, { minLength: step.minLength ?? 1 }).valid;
  const field = (
    <TextField
      label={step.prompt}
      value={value}
      onChangeText={onChange}
      placeholder={step.placeholder}
      autoFocus
      hideLabel={step.chrome === 'simple'}
    />
  );

  if (step.chrome === 'simple') {
    return (
      <SimpleStepFrame
        stepId={step.id}
        onBack={onBack}
        heading={step.prompt}
        onContinue={onContinue}
        continueDisabled={!valid}
        onSkip={step.showSkip ? onContinue : undefined}
      >
        {field}
      </SimpleStepFrame>
    );
  }

  return (
    <QuizScreenFrame
      stepId={step.id}
      onBack={onBack}
      headerVariant="counter"
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      {field}
    </QuizScreenFrame>
  );
}
