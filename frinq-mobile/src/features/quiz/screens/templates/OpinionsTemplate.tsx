import React, { useState } from 'react';
import { View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { ChoicePill } from '../../../../design/components/ChoicePill';
import { BodyText } from '../../../../design/components/Text';
import { QuizProgress } from '../../../../design/components/QuizProgress';
import { TextField } from '../../../../design/components/TextField';
import { VoiceAnswer } from '../../components/VoiceAnswer';
import { spacing } from '../../../../design/tokens/spacing';
import { OpinionsStep, OpinionPair } from '../../domain/quizDefinition';

type Props = {
  step: OpinionsStep;
  submissionId: string;
  onComplete: (picks: string[], whys: string[]) => void;
  onBack?: () => void;
};

/**
 * 4 A/B opinion pairs, one per screen-state, answered in sequence (the
 * "pick" phase) — then, batched (not interleaved), one text+voice "why did
 * you choose this" sub-question per pair that has a whyPrompt (the "why"
 * phase). A step with no whyPrompt on any pair behaves exactly as before:
 * onComplete fires with an empty whys array right after the last pick.
 */
export function OpinionsTemplate({ step, submissionId, onComplete, onBack }: Props) {
  const whyPairs = step.pairs.filter((p): p is OpinionPair & { whyPrompt: string } => !!p.whyPrompt);

  const [phase, setPhase] = useState<'pick' | 'why'>('pick');
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [whyIndex, setWhyIndex] = useState(0);
  const [whys, setWhys] = useState<string[]>([]);
  const [hasRecording, setHasRecording] = useState(false);

  if (phase === 'pick') {
    const pair = step.pairs[index];

    function choose(value: string) {
      const next = [...picks, value];
      if (index + 1 >= step.pairs.length) {
        if (whyPairs.length > 0 && step.whyAnswerKey) {
          setPicks(next);
          setPhase('why');
          setWhyIndex(0);
        } else {
          onComplete(next, []);
        }
        return;
      }
      setPicks(next);
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

  // phase === 'why'
  const whyPair = whyPairs[whyIndex];
  const value = whys[whyIndex] ?? '';
  const valid = value.trim().length > 0 || hasRecording;

  function goBackWithinStep() {
    if (whyIndex === 0) {
      setPhase('pick');
      setIndex(step.pairs.length - 1);
      return;
    }
    setWhyIndex((i) => i - 1);
  }

  function continueWhy() {
    if (whyIndex + 1 >= whyPairs.length) {
      onComplete(picks, whys);
      return;
    }
    setWhyIndex((i) => i + 1);
    setHasRecording(false);
  }

  return (
    <QuizScreenFrame stepId={`${step.id}_why`} section={step.section} onBack={goBackWithinStep} showProgress={false} continueLabel="continue" onContinue={continueWhy} continueDisabled={!valid}>
      <QuizProgress step={whyIndex + 1} total={whyPairs.length} style={{ marginBottom: spacing.lg }} />
      <BodyText variant="subheading" style={{ marginBottom: spacing.lg }}>
        {whyPair.whyPrompt}
      </BodyText>
      {whyPair.whyAllowVoice && (
        <VoiceAnswer
          submissionId={submissionId}
          questionKey={`${step.whyAnswerKey}_${whyIndex}`}
          onStatusChange={setHasRecording}
        />
      )}
      <TextField
        label={whyPair.whyPrompt}
        hideLabel
        value={value}
        onChangeText={(v) => setWhys((prev) => { const next = [...prev]; next[whyIndex] = v; return next; })}
        placeholder="genuinely curious..."
        multiline
        numberOfLines={4}
      />
    </QuizScreenFrame>
  );
}
