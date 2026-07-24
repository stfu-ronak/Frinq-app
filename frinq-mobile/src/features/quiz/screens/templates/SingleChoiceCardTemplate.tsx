import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoiceCard } from '../../../../design/components/ChoiceCard';
import { TextField } from '../../../../design/components/TextField';
import { spacing } from '../../../../design/tokens/spacing';
import { SingleChoiceCardStep } from '../../domain/quizDefinition';

type Props = {
  step: SingleChoiceCardStep;
  value: string;
  /** Selecting a card (or submitting custom text) advances immediately,
   *  matching the web reference's single-tap-to-advance behavior. */
  onSelect: (value: string) => void;
  onBack?: () => void;
};

export function SingleChoiceCardTemplate({ step, value, onSelect, onBack }: Props) {
  const isKnownOption = step.options.some((o) => o.value === value);
  const [customText, setCustomText] = useState(isKnownOption ? '' : value);

  return (
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={onBack}>
      <View style={{ gap: spacing.md }}>
        {step.options.map((opt) => (
          <ChoiceCard
            key={opt.value}
            title={opt.label}
            description={opt.description}
            selected={value === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
      {step.allowCustom && (
        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label={step.customLabel ?? 'or describe your own'}
            value={customText}
            onChangeText={setCustomText}
            placeholder={step.customPlaceholder}
            onSubmitEditing={() => customText.trim() && onSelect(customText.trim())}
            returnKeyType="done"
          />
        </View>
      )}
    </QuizScreenFrame>
  );
}
