import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { BoxChoice, BoxChoiceDivider } from '../../../../design/components/BoxChoice';
import { QUESTION_HEADING_SLOT_H, QuestionHeading } from '../../../../design/components/Text';
import { VoiceOrTextTemplate } from './VoiceOrTextTemplate';
import { spacing } from '../../../../design/tokens/spacing';
import { OpinionsStep, VoiceOrTextStep } from '../../domain/quizDefinition';

type Props = {
  step: OpinionsStep;
  submissionId: string;
  onComplete: (picks: string[], whys: string[]) => void;
  onBack?: () => void;
};

type SubStep =
  | { kind: 'pick'; pairIndex: number }
  | { kind: 'why'; pairIndex: number; whyIndex: number };

// How long the tapped side stays visibly filled before the screen actually
// advances — same convention as Rapid Fire's PICK_FLASH_MS.
const PICK_FLASH_MS = 220;

/**
 * Each A/B pair is its own counted screen, immediately followed by that same
 * pair's "why did you pick that" follow-up (if it has one) — not batched into
 * a separate "why" phase after all 4 picks, and not sharing one screen/one
 * counter number across the whole step (see domain/quizDefinition.ts's
 * unitsForStep). Tapping a side fills it, then advances on its own after a
 * brief pause — no separate confirm button, same as every other single-pick
 * screen in the quiz. The why follow-up reuses VoiceOrTextTemplate itself
 * rather than a bespoke layout, matching every other voice/text question
 * exactly, and echoes back the side just picked as small muted context.
 */
export function OpinionsTemplate({ step, submissionId, onComplete, onBack }: Props) {
  const subSteps: SubStep[] = [];
  step.pairs.forEach((p, pairIndex) => {
    subSteps.push({ kind: 'pick', pairIndex });
    if (p.whyPrompt) subSteps.push({ kind: 'why', pairIndex, whyIndex: subSteps.filter((s) => s.kind === 'why').length });
  });

  const [subIndex, setSubIndex] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [whys, setWhys] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [whyText, setWhyText] = useState('');
  // Separate from `picked` on purpose: `picked` also holds the PREFILLED
  // prior answer when re-entering a pair via back, which must stay tappable
  // (re-picking the other side needs to work), not treated as "already
  // mid-advance" the way a live tap's brief flash does.
  const advancingRef = useRef(false);

  const sub = subSteps[subIndex];

  // Re-entering a previously-answered sub-step (via back) prefills it rather
  // than starting blank.
  useEffect(() => {
    if (!sub) return;
    advancingRef.current = false;
    if (sub.kind === 'pick') setPicked(picks[sub.pairIndex]);
    else setWhyText(whys[sub.whyIndex] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subIndex]);

  if (!sub) return null;

  function advance(nextPicks: string[], nextWhys: string[]) {
    if (subIndex + 1 >= subSteps.length) {
      onComplete(nextPicks, nextWhys);
      return;
    }
    setSubIndex((i) => i + 1);
  }

  function goBackSub() {
    if (subIndex === 0) {
      onBack?.();
      return;
    }
    setSubIndex((i) => i - 1);
  }

  if (sub.kind === 'pick') {
    const pair = step.pairs[sub.pairIndex];

    function pickAndAdvance(value: string) {
      if (advancingRef.current) return; // already advancing — ignore a second tap
      advancingRef.current = true;
      setPicked(value);
      const nextPicks = [...picks];
      nextPicks[sub.pairIndex] = value;
      setTimeout(() => {
        setPicks(nextPicks);
        advance(nextPicks, whys);
      }, PICK_FLASH_MS);
    }

    return (
      <QuizScreenFrame stepId={step.id} subIndex={subIndex} headerVariant="counter" onBack={goBackSub}>
        {/* The prompt is taken OUT of the flow (absolute, same top and same
            reserved height as everywhere else) so the choice group is the only
            flow child and `justifyContent: center` centres it on the whole
            content area — i.e. the "or" lands on the centre line of everything
            below the progress wave, not the centre of the leftover space under
            the prompt. Opinion prompts are one or two lines, so the group never
            reaches back up into the text. */}
        <View style={styles.floatingHeading} pointerEvents="none">
          <QuestionHeading>{pair.prompt}</QuestionHeading>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
          <BoxChoice label={pair.a} selected={picked === pair.a} onPress={() => pickAndAdvance(pair.a)} />
          <BoxChoiceDivider />
          <BoxChoice label={pair.b} selected={picked === pair.b} onPress={() => pickAndAdvance(pair.b)} />
        </View>
      </QuizScreenFrame>
    );
  }

  // sub.kind === 'why'
  const whyPair = step.pairs[sub.pairIndex];
  const whySubIndex = sub.whyIndex;
  const voiceOrTextStep: VoiceOrTextStep = {
    id: `${step.id}_why_${sub.pairIndex}`,
    kind: 'voiceOrText',
    section: step.section,
    answerKey: `${step.whyAnswerKey}_${whySubIndex}`,
    heading: whyPair.whyPrompt!,
    placeholder: 'genuinely curious...',
  };

  function confirmWhy() {
    const nextWhys = [...whys];
    nextWhys[whySubIndex] = whyText;
    setWhys(nextWhys);
    advance(picks, nextWhys);
  }

  return (
    <VoiceOrTextTemplate
      step={voiceOrTextStep}
      submissionId={submissionId}
      value={whyText}
      onChange={setWhyText}
      onContinue={confirmWhy}
      onBack={goBackSub}
      stepIdOverride={step.id}
      subIndex={subIndex}
      contextLine={picks[sub.pairIndex]}
    />
  );
}

const styles = StyleSheet.create({
  floatingHeading: { position: 'absolute', top: 0, left: 0, right: 0, height: QUESTION_HEADING_SLOT_H },
});
