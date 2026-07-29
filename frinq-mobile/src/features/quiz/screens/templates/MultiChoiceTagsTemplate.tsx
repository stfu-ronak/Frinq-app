import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TagPicker } from '../../../../design/components/TagPicker';
import { ChoiceListRow } from '../../../../design/components/ChoiceListRow';
import { TextField } from '../../../../design/components/TextField';
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
  const isCustomEntry = (v: string) => !step.options.includes(v);
  const [customText, setCustomText] = useState(() => value.find(isCustomEntry) ?? '');
  const valid = validateMultiChoice(value, { min: step.min, max: step.max }).valid;

  function setSelectedOptions(next: string[]) {
    onChange(customText.trim() ? [...next, customText.trim()] : next);
  }

  function setCustom(text: string) {
    setCustomText(text);
    const selectedOptions = value.filter((v) => !isCustomEntry(v));
    onChange(text.trim() ? [...selectedOptions, text.trim()] : selectedOptions);
  }

  const selectedOptions = value.filter((v) => !isCustomEntry(v));

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
      {step.layout === 'list' ? (
        <View style={{ gap: spacing.sm }} accessibilityRole="list">
          {step.options.map((opt) => (
            <ChoiceListRow
              key={opt}
              label={opt}
              selected={selectedOptions.includes(opt)}
              onPress={() => setSelectedOptions(
                selectedOptions.includes(opt) ? selectedOptions.filter((o) => o !== opt) : [...selectedOptions, opt],
              )}
            />
          ))}
        </View>
      ) : (
        <TagPicker options={step.options} selected={selectedOptions} onChange={setSelectedOptions} max={step.max} />
      )}
      {step.allowCustom && (
        <TextField
          label="anything else?"
          value={customText}
          onChangeText={setCustom}
          placeholder={step.customPlaceholder}
          containerStyle={{ marginTop: spacing.lg }}
        />
      )}
    </QuizScreenFrame>
  );
}
