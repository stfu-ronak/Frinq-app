import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoicePill } from '../../../../design/components/ChoicePill';
import { RapidFireTimer } from '../../../../design/components/RapidFireTimer';
import { BodyText } from '../../../../design/components/Text';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { spacing, touchTarget } from '../../../../design/tokens/spacing';
import { color } from '../../../../design/tokens/colors';
import { RapidFireStep } from '../../domain/quizDefinition';

type Props = {
  step: RapidFireStep;
  /** Completed answers so far (resumed length lets a re-visit continue, not
   *  restart, though the web reference always restarts on entry — matched
   *  here for parity: pass an empty array to start fresh). */
  onComplete: (answers: string[]) => void;
  onBack?: () => void;
};

function DotProgress({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.dotCol}>
          {i === current ? (
            <BodyText variant="body">🔥</BodyText>
          ) : (
            <View style={[styles.dot, i < current && styles.dotDone]} />
          )}
          <BodyText variant="caption" tone="secondary">{String(i + 1).padStart(2, '0')}</BodyText>
        </View>
      ))}
    </View>
  );
}

/** Timed A/B pairs. Tapping a side highlights it (doesn't advance); "Next"
 *  commits it. Auto-picks a random side and advances if the timer runs out —
 *  matches the web reference's auto-pick, just with an explicit Next affordance
 *  added for a deliberately-made choice, per the new design. */
export function RapidFireTemplate({ step, onComplete, onBack }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(step.secondsPerPair);
  const [chosen, setChosen] = useState<string | undefined>(undefined);

  const pair = step.pairs[index];
  const done = index >= step.pairs.length;

  useEffect(() => {
    if (done) return;
    setSecondsLeft(step.secondsPerPair);
    setChosen(undefined);
  }, [index, done, step.secondsPerPair]);

  useEffect(() => {
    if (done) return;
    if (secondsLeft <= 0) {
      choose(chosen ?? (Math.random() < 0.5 ? pair.a : pair.b));
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
    setAnswers((prev) => [...prev, value]);
    setIndex((i) => i + 1);
  }

  if (done) return null; // onComplete already fired; parent navigates away

  return (
    <QuizScreenFrame stepId={step.id} section={step.section} onBack={index === 0 ? onBack : undefined} showProgress={false}>
      <DotProgress total={step.pairs.length} current={index} />
      <RapidFireTimer secondsLeft={secondsLeft} total={step.secondsPerPair} style={styles.timer} />
      <View style={{ gap: spacing.md }}>
        <ChoicePill label={pair.a} selected={chosen === pair.a} onPress={() => setChosen(pair.a)} />
        <ChoicePill label={pair.b} selected={chosen === pair.b} onPress={() => setChosen(pair.b)} />
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Next"
        accessibilityState={{ disabled: !chosen }}
        disabled={!chosen}
        onPress={() => chosen && choose(chosen)}
        style={styles.next}
      >
        <BodyText variant="bodyStrong" tone={chosen ? 'primary' : 'disabled'}>Next</BodyText>
      </PressableScale>
    </QuizScreenFrame>
  );
}

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  dotCol: { alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: color.border.subtle },
  dotDone: { backgroundColor: color.state.selected },
  timer: { alignSelf: 'center', marginBottom: spacing.xl },
  next: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', marginTop: spacing.lg },
});
