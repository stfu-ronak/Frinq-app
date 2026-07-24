import React from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { SnapSlider } from '../../components/SnapSlider';
import { PreferencesStep } from '../../domain/quizDefinition';

type Props = {
  step: PreferencesStep;
  /** One entry per slider, in step.sliders order; 0/25/50/75/100 or undefined. */
  values: Array<number | undefined>;
  onChange: (index: number, value: number) => void;
  onContinue: () => void;
  onBack?: () => void;
};

export function PreferencesTemplate({ step, values, onChange, onContinue, onBack }: Props) {
  const allAnswered = values.length === step.sliders.length && values.every((v) => v !== undefined);
  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={onBack}
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!allAnswered}
    >
      {step.sliders.map((slider, i) => (
        <SnapSlider
          key={i}
          prompt={slider.prompt}
          leftLabel={slider.leftLabel}
          leftHint={slider.leftHint}
          rightLabel={slider.rightLabel}
          rightHint={slider.rightHint}
          value={values[i]}
          onChange={(v) => onChange(i, v)}
        />
      ))}
    </QuizScreenFrame>
  );
}
