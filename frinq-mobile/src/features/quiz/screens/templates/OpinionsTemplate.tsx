import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoicePill } from '../../../../design/components/ChoicePill';
import { BodyText } from '../../../../design/components/Text';
import { QuizProgress } from '../../../../design/components/QuizProgress';
import { spacing } from '../../../../design/tokens/spacing';
import { OpinionsStep } from '../../domain/quizDefinition';

type Props = {
  step: OpinionsStep;
  onComplete: (answers: string[]) => void;
  onBack?: () => void;
};

/** 4 A/B opinion pairs, one per screen-state, answered in sequence. */
export function OpinionsTemplate({ step, onComplete, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const pair = step.pairs[index];

  function choose(value: string) {
    const next = [...answers, value];
    if (index + 1 >= step.pairs.length) {
      onComplete(next);
      return;
    }
    setAnswers(next);
    setIndex(index + 1);
  }

  return (
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={index === 0 ? onBack : () => setIndex((i) => Math.max(0, i - 1))} showProgress={false}>
      <QuizProgress step={index + 1} total={step.pairs.length} style={{ marginBottom: spacing.lg }} />
      <BodyText variant="overline" tone="secondary" style={{ marginBottom: spacing.sm }}>
        pick your side
      </BodyText>
      <BodyText variant="subheading" style={{ marginBottom: spacing.xl }}>
        {pair.prompt}
      </BodyText>
      <View style={{ gap: spacing.md }}>
        <ChoicePill label={pair.a} selected={false} onPress={() => choose(pair.a)} />
        <ChoicePill label={pair.b} selected={false} onPress={() => choose(pair.b)} />
      </View>
    </QuizScreenFrame>
  );
}
