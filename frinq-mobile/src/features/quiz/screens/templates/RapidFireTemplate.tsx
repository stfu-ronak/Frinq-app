import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { RapidFireTimer } from '../../../../design/components/RapidFireTimer';
import { BodyText, BrandHeading } from '../../../../design/components/Text';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { fontFamily } from '../../../../design/tokens/typography';
import { spacing, touchTarget, radius } from '../../../../design/tokens/spacing';
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

/** Bespoke rectangular choice, distinct from BoxChoice — Figma node 163:2121
 *  ("Rapid Fire" is this app's one visually-different quiz screen): 327x98,
 *  radius 12, thin maroon outline, filled maroon + white text when picked. */
function RapidChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, { backgroundColor: selected ? color.control.primaryBg : 'transparent' }]}
    >
      <BodyText style={{ ...styles.choiceText, color: selected ? color.control.primaryText : color.brand.maroon }}>{label}</BodyText>
    </PressableScale>
  );
}

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
    <QuizScreenFrame
      stepId={step.id}
      headerVariant="counter"
      onBack={index === 0 ? onBack : undefined}
      footer={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next"
          accessibilityState={{ disabled: !chosen }}
          disabled={!chosen}
          onPress={() => chosen && choose(chosen)}
          style={styles.next}
        >
          <BodyText style={{ ...styles.nextText, color: chosen ? color.brand.maroon : color.text.disabled }}>Next</BodyText>
        </PressableScale>
      }
    >
      <BrandHeading variant="display" tone="brand" style={styles.title}>Rapid Fire</BrandHeading>
      <DotProgress total={step.pairs.length} current={index} />
      <RapidFireTimer secondsLeft={secondsLeft} total={step.secondsPerPair} style={styles.timer} />
      {!!step.prompt && (
        <BodyText style={styles.prompt}>{step.prompt}</BodyText>
      )}
      <View style={{ gap: spacing.md }}>
        <RapidChoice label={pair.a} selected={chosen === pair.a} onPress={() => setChosen(pair.a)} />
        <RapidChoice label={pair.b} selected={chosen === pair.b} onPress={() => setChosen(pair.b)} />
      </View>
    </QuizScreenFrame>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 48, textAlign: 'center', marginBottom: spacing.lg },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  dotCol: { alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: color.border.subtle },
  dotDone: { backgroundColor: color.state.selected },
  timer: { alignSelf: 'center', marginBottom: spacing.xl },
  prompt: { fontFamily: fontFamily.body, fontSize: 20, textAlign: 'center', marginBottom: spacing.lg },
  choice: { width: '100%', minHeight: 98, borderWidth: 1, borderColor: color.brand.maroon, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  choiceText: { fontFamily: fontFamily.bodyMedium, fontSize: 14, textAlign: 'center' },
  next: { minHeight: touchTarget.preferred, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  nextText: { fontFamily: fontFamily.bodySemiBold, fontSize: 20 },
});
