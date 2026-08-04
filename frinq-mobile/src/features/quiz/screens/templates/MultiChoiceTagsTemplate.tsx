import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TagPicker } from '../../../../design/components/TagPicker';
import { IconChoiceRow, IconChoiceGlyph } from '../../../../design/components/IconChoiceRow';
import { TextField } from '../../../../design/components/TextField';
import { BodyText, BrandHeading } from '../../../../design/components/Text';
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

/** Per-option icon for the icon-list layout — cosmetic only, keyed by the
 *  exact option text; options with no clean icon match fall back to a plain
 *  dot in IconChoiceRow rather than a mismatched glyph. */
const ICON_BY_OPTION: Record<string, IconChoiceGlyph> = {
  'a beer or two. socially.': 'beer',
  'hard drinks when i drink.': 'drink',
  'some combination depending on the night.': 'party',
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
      onBack={onBack}
      headerVariant="glow"
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      <BrandHeading variant="display" tone="brand" style={{ fontSize: 32, lineHeight: 48, textAlign: 'center', marginBottom: spacing.sm }}>
        {step.prompt}
      </BrandHeading>
      {!!step.subtext && (
        <BodyText variant="caption" tone="secondary" style={{ marginBottom: spacing.lg }}>
          {step.subtext}
        </BodyText>
      )}
      {step.layout === 'list' ? (
        <View accessibilityRole="list">
          {step.options.map((opt) => (
            <IconChoiceRow
              key={opt}
              label={opt}
              glyph={ICON_BY_OPTION[opt]}
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
