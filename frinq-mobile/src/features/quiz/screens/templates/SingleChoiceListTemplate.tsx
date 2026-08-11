import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { SimpleStepFrame } from '../../components/SimpleStepFrame';
import { BodyText, QuestionHeading } from '../../../../design/components/Text';
import { BoxChoice, BoxChoiceDivider } from '../../../../design/components/BoxChoice';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { fontFamily } from '../../../../design/tokens/typography';
import { color } from '../../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../../design/tokens/spacing';
import { SingleChoiceListStep } from '../../domain/quizDefinition';

type Props = {
  step: SingleChoiceListStep;
  value: string;
  /** In progress-chrome (default) steps, selecting a row advances immediately.
   *  In simple-chrome steps (deliberate Continue, matching the new design's
   *  onboarding/would-you-rather screens), selecting only highlights — the
   *  Continue button commits it. */
  onSelect: (value: string) => void;
  onBack?: () => void;
};

/** Plain outlined pill, no icon/description — Figma "Frame 409" ("what is
 *  your social type?" and similar "who you are" MCQ lists): a faded maroon
 *  outline and faded-brown light-weight label at rest, filled maroon +
 *  cream label when selected. */
function PlainPillOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.plainPill, { borderColor: selected ? color.border.default : color.border.pill, backgroundColor: selected ? color.state.selected : 'transparent' }]}
    >
      <BodyText style={{ ...styles.plainPillText, color: selected ? color.text.onMaroon : color.text.pillLabel }}>{label}</BodyText>
    </PressableScale>
  );
}

export function SingleChoiceListTemplate({ step, value, onSelect, onBack }: Props) {
  const isSimple = step.chrome === 'simple';
  const variant = step.variant ?? 'pill';
  const [pending, setPending] = useState(value);

  const options = variant === 'box' ? (
    <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
      {step.options.map((opt, i) => (
        <React.Fragment key={opt.value}>
          {i > 0 && <BoxChoiceDivider />}
          <BoxChoice
            label={opt.label}
            selected={(isSimple ? pending : value) === opt.value}
            onPress={() => (isSimple ? setPending(opt.value) : onSelect(opt.value))}
          />
        </React.Fragment>
      ))}
    </View>
  ) : (
    <View style={{ gap: spacing.md }} accessibilityRole="radiogroup">
      {step.options.map((opt) => (
        <PlainPillOption
          key={opt.value}
          label={opt.label}
          selected={(isSimple ? pending : value) === opt.value}
          onPress={() => (isSimple ? setPending(opt.value) : onSelect(opt.value))}
        />
      ))}
    </View>
  );

  if (isSimple) {
    return (
      <SimpleStepFrame
        stepId={step.id}
        onBack={onBack}
        heading={step.prompt}
        onContinue={() => onSelect(pending)}
        continueDisabled={!pending}
      >
        {options}
      </SimpleStepFrame>
    );
  }

  return (
    <QuizScreenFrame stepId={step.id} onBack={onBack} headerVariant="glow">
      <QuestionHeading>{step.prompt}</QuestionHeading>
      {options}
    </QuizScreenFrame>
  );
}

const styles = StyleSheet.create({
  plainPill: {
    width: '100%',
    minHeight: touchTarget.min,
    borderWidth: 0.5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  plainPillText: { fontFamily: fontFamily.bodyLight, fontSize: 20 },
});
