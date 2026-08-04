import React, { useState } from 'react';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { QuizProgress } from '../../../../design/components/QuizProgress';
import { SnapSlider } from '../../components/SnapSlider';
import { spacing } from '../../../../design/tokens/spacing';
import { PreferencesStep } from '../../domain/quizDefinition';

type Props = {
  step: PreferencesStep;
  /** One entry per slider, in step.sliders order; 0/25/50/75/100 or undefined. */
  values: Array<number | undefined>;
  onChange: (index: number, value: number) => void;
  onContinue: () => void;
  onBack?: () => void;
};

/** One statement per screen (paginated by an internal index), matching the
 *  Figma "not me ↔ that's so me!" slider design — not all sliders stacked
 *  on one page. External contract (values/onChange/onContinue/onBack)
 *  is unchanged, so QuizStepScreen needs no changes: onContinue only
 *  fires once, after the last slider. */
export function PreferencesTemplate({ step, values, onChange, onContinue, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const slider = step.sliders[index];
  const isLast = index === step.sliders.length - 1;

  function handleContinue() {
    if (isLast) {
      onContinue();
      return;
    }
    setIndex((i) => i + 1);
  }

  function handleBack() {
    if (index === 0) {
      onBack?.();
      return;
    }
    setIndex((i) => i - 1);
  }

  return (
    <QuizScreenFrame
      stepId={step.id}
      onBack={index > 0 || onBack ? handleBack : undefined}
      headerVariant="counter"
      continueLabel="continue"
      onContinue={handleContinue}
      continueDisabled={values[index] === undefined}
    >
      <QuizProgress step={index + 1} total={step.sliders.length} style={{ marginBottom: spacing.lg }} />
      <SnapSlider
        prompt={slider.prompt}
        leftLabel={slider.leftLabel}
        leftHint={slider.leftHint}
        rightLabel={slider.rightLabel}
        rightHint={slider.rightHint}
        value={values[index]}
        onChange={(v) => onChange(index, v)}
      />
    </QuizScreenFrame>
  );
}
