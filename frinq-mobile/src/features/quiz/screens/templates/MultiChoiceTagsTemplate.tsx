import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TagPicker } from '../../../../design/components/TagPicker';
import { IconChoiceRow, IconChoiceGlyph } from '../../../../design/components/IconChoiceRow';
import { TagInputField } from '../../../../design/components/TagInputField';
import { BodyText, QuestionHeading } from '../../../../design/components/Text';
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
  "i don't drink or smoke.": 'noDrink',
  'a beer or two. socially.': 'beer',
  'hard drinks when i drink.': 'drink',
  "i smoke or vape. that's my thing.": 'smoke',
  'weed is how i decompress.': 'leaf',
  'some combination depending on the night.': 'mix',
};

export function MultiChoiceTagsTemplate({ step, value, onChange, onContinue, onBack }: Props) {
  const isCustomEntry = (v: string) => !step.options.includes(v);
  // Each Enter commits the current text as its OWN separate answer (a chip),
  // same idea as picking a listed option — not one long comma-joined string.
  // `customText` is only the in-progress, not-yet-committed word/phrase.
  const [customEntries, setCustomEntries] = useState(() => value.filter(isCustomEntry));
  const [customText, setCustomText] = useState('');
  const valid = validateMultiChoice(value, { min: step.min, max: step.max }).valid;

  const selectedOptions = value.filter((v) => !isCustomEntry(v));

  function setSelectedOptions(next: string[]) {
    onChange([...next, ...customEntries]);
  }

  function commitCustomEntry() {
    const text = customText.trim();
    if (!text) return;
    const nextEntries = [...customEntries, text];
    setCustomEntries(nextEntries);
    setCustomText('');
    onChange([...selectedOptions, ...nextEntries]);
  }

  /** The panel shows EVERY current answer — grid picks and typed-in entries
   *  alike — so removing one there deselects a grid pick or drops a custom
   *  entry, whichever it actually is. */
  function removePanelEntry(entry: string) {
    if (isCustomEntry(entry)) {
      const nextEntries = customEntries.filter((e) => e !== entry);
      setCustomEntries(nextEntries);
      onChange([...selectedOptions, ...nextEntries]);
    } else {
      onChange([...selectedOptions.filter((o) => o !== entry), ...customEntries]);
    }
  }

  return (
    <QuizScreenFrame
      stepId={step.id}
      onBack={onBack}
      headerVariant="glow"
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
      // Question AND the free-text field are both fixed at the top; only the
      // option list scrolls beneath them. The field used to sit below the
      // scroll, which put the thing you type into furthest from the question
      // it answers and let a long option list squeeze it against the footer.
      aboveScroll={
        <>
          <QuestionHeading
            fluid
            extra={!!step.subtext && (
              <BodyText variant="caption" tone="secondary" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                {step.subtext}
              </BodyText>
            )}
          >
            {step.prompt}
          </QuestionHeading>
          {step.allowCustom && (
            <TagInputField
              label="anything else?"
              entries={[...selectedOptions, ...customEntries]}
              onRemoveEntry={removePanelEntry}
              value={customText}
              onChangeText={setCustomText}
              onSubmit={commitCustomEntry}
              placeholder={step.customPlaceholder}
              style={{ marginBottom: spacing.lg }}
            />
          )}
        </>
      }
    >
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
    </QuizScreenFrame>
  );
}
