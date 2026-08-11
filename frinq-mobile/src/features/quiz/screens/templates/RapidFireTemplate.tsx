import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { RapidFireTimer } from '../../../../design/components/RapidFireTimer';
import { BodyText, BrandHeading } from '../../../../design/components/Text';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { fontFamily } from '../../../../design/tokens/typography';
import { spacing, radius } from '../../../../design/tokens/spacing';
import { color } from '../../../../design/tokens/colors';
import { RapidFireStep } from '../../domain/quizDefinition';

type Props = {
  step: RapidFireStep;
  /** Completed answers so far (resumed length lets a re-visit continue, not
   *  restart, though the web reference always restarts on entry — matched
   *  here for parity: pass an empty array to start fresh). */
  onComplete: (answers: string[]) => void;
};

/** Bespoke rectangular choice, distinct from BoxChoice — Figma node 163:2121
 *  ("Rapid Fire" is this app's one visually-different quiz screen): 327x98,
 *  radius 12, thin maroon outline, filled maroon + white text once picked —
 *  the fill is the only confirmation a tap registered before the screen
 *  moves on, so it must get a paint even though the advance is immediate. */
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

/** Every dot (past AND future) reads the same solid maroon — only the
 *  current pair differs, swapped for a flame — connected by a thin rail so
 *  the row reads as one continuous track rather than floating markers. */
function DotProgress({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dotsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.dotsRail} />
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.dotCol}>
          {/* Both markers live in the SAME fixed-height box, centred — the
              flame is a text glyph and used to hang below the rail because it
              was laid out on its own taller line box than the 8px dot. */}
          <View style={styles.marker}>
            {i === current ? <BodyText style={styles.flame}>🔥</BodyText> : <View style={styles.dot} />}
          </View>
          <BodyText variant="caption" tone="secondary">{String(i + 1).padStart(2, '0')}</BodyText>
        </View>
      ))}
    </View>
  );
}

// How long the tapped side stays visibly filled before the screen actually
// advances — long enough to register as real feedback, short enough that a
// user firing through all 10 pairs doesn't feel throttled.
const PICK_FLASH_MS = 220;

/** Timed A/B pairs. Tapping a side commits it immediately and advances — no
 *  separate "Next" confirm step — but pauses just long enough to show the
 *  tapped side's fill before moving on (see RapidChoice). Letting the
 *  10-second timer run out with nothing tapped commits an EMPTY answer (a
 *  real "didn't choose", not a guessed pick) rather than the old
 *  auto-random-side behavior. */
export function RapidFireTemplate({ step, onComplete }: Props) {
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
    if (done || chosen !== undefined) return;
    if (secondsLeft <= 0) {
      choose(''); // ran out with nothing tapped — recorded as a miss, not a guess
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, done, chosen]);

  useEffect(() => {
    if (done) onComplete(answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function choose(value: string) {
    setAnswers((prev) => [...prev, value]);
    setIndex((i) => i + 1);
  }

  function pick(value: string) {
    if (chosen !== undefined) return; // already advancing — ignore a second tap
    setChosen(value);
    setTimeout(() => choose(value), PICK_FLASH_MS);
  }

  if (done) return null; // onComplete already fired; parent navigates away

  return (
    <QuizScreenFrame stepId={step.id} headerVariant="counter" subIndex={index}>
      <BrandHeading variant="display" tone="brand" style={styles.title}>Rapid Fire</BrandHeading>
      <DotProgress total={step.pairs.length} current={index} />
      <RapidFireTimer secondsLeft={secondsLeft} total={step.secondsPerPair} style={styles.timer} />
      {!!step.prompt && (
        <BodyText style={styles.prompt}>{step.prompt}</BodyText>
      )}
      <View style={{ gap: spacing.lg }}>
        <RapidChoice label={pair.a} selected={chosen === pair.a} onPress={() => pick(pair.a)} />
        <RapidChoice label={pair.b} selected={chosen === pair.b} onPress={() => pick(pair.b)} />
      </View>
    </QuizScreenFrame>
  );
}

/** Height of the box each progress marker (dot or flame) is centred in. */
const MARKER_H = 18;

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 48, textAlign: 'center', marginBottom: spacing.lg },
  dotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl, position: 'relative' },
  // Sits on the marker box's centre line, so dots and the flame both
  // straddle it instead of the flame sinking below.
  dotsRail: { position: 'absolute', left: 0, right: 0, top: MARKER_H / 2, height: 1, backgroundColor: color.state.selected },
  dotCol: { alignItems: 'center', gap: spacing.xxs },
  marker: { height: MARKER_H, minWidth: MARKER_H, alignItems: 'center', justifyContent: 'center' },
  flame: { fontSize: 15, lineHeight: MARKER_H, includeFontPadding: false, textAlign: 'center' },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: color.state.selected },
  timer: { alignSelf: 'center', marginBottom: spacing.xl },
  prompt: { fontFamily: fontFamily.body, fontSize: 20, lineHeight: 30, textAlign: 'center', marginBottom: spacing.xl },
  choice: { width: '100%', minHeight: 98, borderWidth: 1, borderColor: color.brand.maroon, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  choiceText: { fontFamily: fontFamily.bodyMedium, fontSize: 14, textAlign: 'center', color: color.brand.maroon },
});
