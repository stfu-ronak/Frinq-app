import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuiz } from '../quizContext';
import { getStep, nextStep, previousStep } from '../domain/quizDefinition';
import {
  IntroTemplate, TextInputTemplate, DateInputTemplate, SingleChoiceCardTemplate,
  SingleChoiceListTemplate, MultiChoiceTagsTemplate, RapidFireTemplate, OpinionsTemplate,
  PreferencesTemplate, VoiceOrTextTemplate,
} from './templates';
import { QuizScreenFrame } from '../components/QuizScreenFrame';
import { SnapSlider } from '../components/SnapSlider';
import { BootSplash } from '../../../navigation/placeholders';
import { ErrorState } from '../../../design/components/ErrorState';

export type QuizStepRouteParams = { Step: { stepId: string } };

/**
 * The typed screen registry: ONE screen component dispatches to the right
 * template by step.kind, driven entirely by domain/quizDefinition.ts. There
 * are no per-step bespoke screen files — adding/reordering a quiz step never
 * touches navigation code.
 */
export function QuizStepScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<QuizStepRouteParams, 'Step'>>();
  const { state, send, onQuizComplete } = useQuiz();
  const step = getStep(route.params.stepId);

  const answerKey = step && 'answerKey' in step ? step.answerKey : null;
  const answer = answerKey ? state.answers[answerKey] : undefined;

  // Preferences holds its in-progress (possibly incomplete) slider values in
  // local state, never in the machine/draft — an array with holes fails the
  // draft repository's bounded-value check (every element must be a real
  // string/number/boolean), and a mid-answer partial send would throw. The
  // complete array is only sent once, in onContinue, once every slider is
  // filled (PreferencesTemplate already gates Continue on exactly that).
  // Declared unconditionally (before the `!step` early return below) — Hooks
  // must run in the same order every render.
  const [localPreferences, setLocalPreferences] = useState<Array<number | undefined>>(
    () => (answer as Array<number | undefined>) ?? [],
  );
  useEffect(() => {
    if (step?.kind === 'preferences') {
      setLocalPreferences((answer as Array<number | undefined>) ?? new Array(step.sliders.length).fill(undefined));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  const [localSlider, setLocalSlider] = useState<number | undefined>(answer as number | undefined);
  useEffect(() => {
    if (step?.kind === 'slider') setLocalSlider(answer as number | undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  // Finalize state for the LAST step. Without this, a failed finalize
  // (offline / 5xx) did nothing visible — the screen just sat there.
  const [finalizeState, setFinalizeState] = useState<'idle' | 'finalizing' | 'error'>('idle');

  // Android hardware-back must route through goBack() (machine BACK + nav pop
  // together). A bare native pop leaves machine.stepId ahead of the route, so
  // the next persistDraft writes a stale lastRoute and the quiz resumes at the
  // wrong step after restart. On the first step (no prev), fall through to the
  // default (exit the quiz).
  useEffect(() => {
    const onBack = () => {
      if (finalizeState !== 'idle') return false;
      if (!step || !previousStep(step.id)) return false;
      goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, finalizeState]);

  if (!step) return null; // unreachable: route params always come from getStep-validated ids

  async function finalize() {
    setFinalizeState('finalizing');
    const ok = await onQuizComplete();
    // On success boot re-resolves and unmounts this screen; only a failure
    // lands back here, where we surface a retry.
    if (!ok) setFinalizeState('error');
  }

  function advanceOrFinish() {
    const next = nextStep(step!.id);
    if (next) {
      send({ type: 'NEXT' });
      navigation.push('Step', { stepId: next });
    } else {
      send({ type: 'NEXT' }); // no-op at the last step, kept for symmetry/draft persistence
      void finalize();
    }
  }

  function goBack() {
    const prev = previousStep(step!.id);
    if (!prev) return;
    send({ type: 'BACK' });
    navigation.goBack();
  }

  // Finalizing the quiz (last step submitted) takes over the screen so the
  // user gets a clear busy state, and a real retry on failure, instead of a
  // frozen-looking screen.
  if (finalizeState === 'finalizing') return <BootSplash />;
  if (finalizeState === 'error') {
    return (
      <ErrorState
        title="Couldn't submit your answers"
        message="Something went wrong finishing your quiz. Check your connection and try again."
        onRetry={() => void finalize()}
      />
    );
  }

  switch (step.kind) {
    case 'intro':
      return <IntroTemplate step={step} onContinue={advanceOrFinish} />;

    case 'text':
      if (step.allowVoice) {
        return (
          <VoiceOrTextTemplate
            step={{ ...step, kind: 'voiceOrText', heading: step.prompt }}
            submissionId={state.submissionId}
            value={(answer as string) ?? ''}
            onChange={(v) => send({ type: 'ANSWER', key: step.answerKey, value: v })}
            onContinue={advanceOrFinish}
            onBack={previousStep(step.id) ? goBack : undefined}
          />
        );
      }
      return (
        <TextInputTemplate
          step={step}
          value={(answer as string) ?? ''}
          onChange={(v) => send({ type: 'ANSWER', key: step.answerKey, value: v })}
          onContinue={advanceOrFinish}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'date':
      return (
        <DateInputTemplate
          step={step}
          value={(answer as string) ?? ''}
          onChange={(v) => send({ type: 'ANSWER', key: step.answerKey, value: v })}
          onContinue={advanceOrFinish}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'singleChoiceCard':
      return (
        <SingleChoiceCardTemplate
          step={step}
          value={(answer as string) ?? ''}
          onSelect={(v) => { send({ type: 'ANSWER', key: step.answerKey, value: v }); advanceOrFinish(); }}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'singleChoiceList':
      return (
        <SingleChoiceListTemplate
          step={step}
          value={(answer as string) ?? ''}
          onSelect={(v) => { send({ type: 'ANSWER', key: step.answerKey, value: v }); advanceOrFinish(); }}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'multiChoiceTags':
      return (
        <MultiChoiceTagsTemplate
          step={step}
          value={(answer as string[]) ?? []}
          onChange={(v) => send({ type: 'ANSWER', key: step.answerKey, value: v })}
          onContinue={advanceOrFinish}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'rapidFire':
      return (
        <RapidFireTemplate
          step={step}
          onComplete={(answers) => { send({ type: 'ANSWER', key: step.answerKey, value: answers }); advanceOrFinish(); }}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'opinions':
      return (
        <OpinionsTemplate
          step={step}
          onComplete={(answers) => { send({ type: 'ANSWER', key: step.answerKey, value: answers }); advanceOrFinish(); }}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );

    case 'preferences': {
      const values = localPreferences.length === step.sliders.length ? localPreferences : new Array(step.sliders.length).fill(undefined);
      return (
        <PreferencesTemplate
          step={step}
          values={values}
          onChange={(index, value) => {
            const next = values.slice();
            next[index] = value;
            setLocalPreferences(next);
          }}
          onContinue={() => {
            send({ type: 'ANSWER', key: step.answerKey, value: values });
            advanceOrFinish();
          }}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );
    }

    case 'slider':
      return (
        <QuizScreenFrame
          stepId={step.id}
          section={step.section}
          onBack={previousStep(step.id) ? goBack : undefined}
          continueLabel="continue"
          onContinue={() => { send({ type: 'ANSWER', key: step.answerKey, value: localSlider }); advanceOrFinish(); }}
          continueDisabled={localSlider === undefined}
        >
          <SnapSlider
            prompt={step.prompt}
            leftLabel={step.leftLabel}
            leftHint={step.leftHint}
            rightLabel={step.rightLabel}
            rightHint={step.rightHint}
            value={localSlider}
            onChange={setLocalSlider}
          />
        </QuizScreenFrame>
      );

    case 'voiceOrText':
      return (
        <VoiceOrTextTemplate
          step={step}
          submissionId={state.submissionId}
          value={(answer as string) ?? ''}
          onChange={(v) => send({ type: 'ANSWER', key: step.answerKey, value: v })}
          onContinue={advanceOrFinish}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );
  }
}
