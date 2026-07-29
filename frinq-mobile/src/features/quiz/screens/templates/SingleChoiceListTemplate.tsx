import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { SimpleStepFrame } from '../../components/SimpleStepFrame';
import { ChoicePill } from '../../../../design/components/ChoicePill';
import { BodyText } from '../../../../design/components/Text';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { color } from '../../../../design/tokens/colors';
import { radius, spacing } from '../../../../design/tokens/spacing';
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

function BoxOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.box,
        { borderColor: color.border.default, backgroundColor: selected ? color.bg.surface : 'transparent' },
      ]}
    >
      <BodyText variant="heading">{label}</BodyText>
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
          {i > 0 && <BodyText variant="bodyStrong" style={styles.orDivider}>or</BodyText>}
          <BoxOption
            label={opt.label}
            selected={(isSimple ? pending : value) === opt.value}
            onPress={() => (isSimple ? setPending(opt.value) : onSelect(opt.value))}
          />
        </React.Fragment>
      ))}
    </View>
  ) : (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
      {step.options.map((opt) => (
        <ChoicePill
          key={opt.value}
          label={opt.label}
          selected={(isSimple ? pending : value) === opt.value}
          onPress={() => (isSimple ? setPending(opt.value) : onSelect(opt.value))}
          style={styles.fullWidthPill}
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
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={onBack}>
      <BodyText variant="subheading" style={{ marginBottom: spacing.lg }}>
        {step.prompt}
      </BodyText>
      {options}
    </QuizScreenFrame>
  );
}

const styles = StyleSheet.create({
  fullWidthPill: { width: '100%', paddingVertical: spacing.md },
  box: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  orDivider: { alignSelf: 'center' },
});
