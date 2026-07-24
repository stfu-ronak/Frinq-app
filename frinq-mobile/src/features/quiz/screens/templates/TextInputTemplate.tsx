import React from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
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
  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={onBack}
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      <TextField
        label={step.prompt}
        value={value}
        onChangeText={onChange}
        placeholder={step.placeholder}
        autoFocus
        hideLabel={false}
      />
    </QuizScreenFrame>
  );
}
