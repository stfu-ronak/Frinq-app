import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { SimpleStepFrame } from '../../components/SimpleStepFrame';
import { TextField } from '../../../../design/components/TextField';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { DateStep } from '../../domain/quizDefinition';
import { validateDob } from '../../domain/answerSchema';

type Props = {
  step: DateStep;
  /** dd/mm/yyyy, matching quizDraftRepository's stored format. */
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
};

const ERROR_COPY: Record<string, string> = {
  bad_format: "that doesn't look like a real date",
  bad_date: "that doesn't look like a real date",
  under_18: 'frinq is for 18+ right now',
};

function parts(value: string): [string, string, string] {
  const [dd = '', mm = '', yyyy = ''] = value.split('/');
  return [dd, mm, yyyy];
}

export function DateInputTemplate({ step, value, onChange, onContinue, onBack }: Props) {
  const [day, month, year] = parts(value);
  const [touched, setTouched] = useState(false);
  const result = validateDob(value);
  // Continue stays pressable once all three fields are filled in, even if the
  // date turns out invalid — that's the only way an inline error (wrong
  // format, under 18) can ever be shown; a hard-disabled button would block
  // the user from ever finding out why.
  const allFieldsFilled = day.length > 0 && month.length > 0 && year.length === 4;

  function setPart(i: 0 | 1 | 2, v: string) {
    const p = parts(value);
    p[i] = v.replace(/\D/g, '');
    onChange(p.join('/'));
    // Editing any field clears the error latch — otherwise a stale `touched`
    // from a prior Continue-press re-shows the error on every keystroke of a
    // half-typed date (e.g. flashing "not a real date" while typing "3" of "03").
    setTouched(false);
  }

  const handleContinue = () => { setTouched(true); if (result.valid) onContinue(); };
  const isSimple = step.chrome === 'simple';

  const fields = (
    <>
      {!isSimple && (
        <BodyText variant="subheading" style={{ marginBottom: spacing.lg }}>
          {step.prompt}
        </BodyText>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <TextField label="day" value={day} onChangeText={(v) => setPart(0, v)} keyboardType="number-pad" maxLength={2} placeholder="14" containerStyle={{ flex: 1 }} />
        <TextField label="month" value={month} onChangeText={(v) => setPart(1, v)} keyboardType="number-pad" maxLength={2} placeholder="03" containerStyle={{ flex: 1 }} />
        <TextField label="year" value={year} onChangeText={(v) => setPart(2, v)} keyboardType="number-pad" maxLength={4} placeholder="1999" containerStyle={{ flex: 1.3 }} />
      </View>
      {touched && !result.valid && result.reason && (
        <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={{ marginTop: spacing.md }}>
          {ERROR_COPY[result.reason] ?? "that doesn't look like a real date"}
        </BodyText>
      )}
    </>
  );

  if (isSimple) {
    return (
      <SimpleStepFrame
        stepId={step.id}
        onBack={onBack}
        heading={step.prompt}
        onContinue={handleContinue}
        continueDisabled={!allFieldsFilled}
      >
        {fields}
      </SimpleStepFrame>
    );
  }

  return (
    <QuizScreenFrame
      stepId={step.id}
      section={step.section}
      onBack={onBack}
      continueLabel="continue"
      onContinue={handleContinue}
      continueDisabled={!allFieldsFilled}
    >
      {fields}
    </QuizScreenFrame>
  );
}
