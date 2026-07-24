import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoicePill } from '../../../../design/components/ChoicePill';
import { RapidFireTimer } from '../../../../design/components/RapidFireTimer';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { RapidFireStep } from '../../domain/quizDefinition';

type Props = {
  step: RapidFireStep;
  /** Completed answers so far (resumed length lets a re-visit continue, not
   *  restart, though the web reference always restarts on entry — matched
   *  here for parity: pass an empty array to start fresh). */
  onComplete: (answers: string[]) => void;
  onBack?: () => void;
};

/** Timed A/B pairs. Auto-picks a random side if the timer runs out — matches
 *  the web reference. Runs entirely locally; onComplete fires once after the
 *  last pair. */
export function RapidFireTemplate({ step, onComplete, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(step.secondsPerPair);

  const pair = step.pairs[index];
  const done = index >= step.pairs.length;

  useEffect(() => {
    if (done) return;
    setSecondsLeft(step.secondsPerPair);
  }, [index, done, step.secondsPerPair]);

  useEffect(() => {
    if (done) return;
    if (secondsLeft <= 0) {
      choose(Math.random() < 0.5 ? pair.a : pair.b);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, done]);

  useEffect(() => {
    if (done) onComplete(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function choose(value: string) {
    setAnswers((prev) => {
      const next = [...prev, value];
      return next;
    });
    setIndex((i) => i + 1);
  }

  if (done) return null; // onComplete already fired; parent navigates away

  return (
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={index === 0 ? onBack : undefined} showProgress={false}>
      <BodyText variant="overline" tone="secondary" style={{ marginBottom: spacing.md }}>
        choose one · {index + 1}/{step.pairs.length}
      </BodyText>
      <RapidFireTimer secondsLeft={secondsLeft} total={step.secondsPerPair} style={{ marginBottom: spacing.xl }} />
      <View style={{ gap: spacing.md }}>
        <ChoicePill label={pair.a} selected={false} onPress={() => choose(pair.a)} />
        <ChoicePill label={pair.b} selected={false} onPress={() => choose(pair.b)} />
      </View>
    </QuizScreenFrame>
  );
}
