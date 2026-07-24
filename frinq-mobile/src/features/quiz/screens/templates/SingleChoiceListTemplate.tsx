import React from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoiceListRow } from '../../../../design/components/ChoiceListRow';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { SingleChoiceListStep } from '../../domain/quizDefinition';

type Props = {
  step: SingleChoiceListStep;
  value: string;
  /** Selecting a row advances immediately (matches web reference). */
  onSelect: (value: string) => void;
  onBack?: () => void;
};

export function SingleChoiceListTemplate({ step, value, onSelect, onBack }: Props) {
  return (
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={onBack}>
      <BodyText variant="subheading" style={{ marginBottom: spacing.lg }}>
        {step.prompt}
      </BodyText>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        {step.options.map((opt) => (
          <ChoiceListRow key={opt.value} label={opt.label} selected={value === opt.value} onPress={() => onSelect(opt.value)} />
        ))}
      </View>
    </QuizScreenFrame>
  );
}
