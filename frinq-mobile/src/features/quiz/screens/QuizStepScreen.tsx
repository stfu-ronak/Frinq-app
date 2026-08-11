import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuiz } from '../quizContext';
import { getStep, nextStep, previousStep } from '../domain/quizDefinition';
import {
  IntroTemplate, TextInputTemplate, DateInputTemplate, SingleChoiceCardTemplate,
  SingleChoiceListTemplate, MultiChoiceTagsTemplate, RapidFireTemplate, OpinionsTemplate,
  PreferencesTemplate, VoiceOrTextTemplate, SocialVerificationTemplate,
} from './templates';
import { isReferenceOnboardingStep, ReferenceOnboardingTemplate } from './templates/ReferenceOnboardingTemplate';
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

  // finalize/advanceOrFinish/goBack are useCallback (stable identity across
  // re-renders) so the memoized templates below (and quizContext's memoized
  // provider value) actually skip re-rendering instead of getting a fresh
  // closure prop every render. Declared before the `!step` early return
  // (hooks must run unconditionally) and guard internally instead.
  const finalize = useCallback(async () => {
    setFinalizeState('finalizing');
    const ok = await onQuizComplete();
    // On success boot re-resolves and unmounts this screen; only a failure
    // lands back here, where we surface a retry.
    if (!ok) setFinalizeState('error');
  }, [onQuizComplete]);

  // Guards against a double-tap (or a timer auto-pick landing in the same
  // tick as a manual tap) firing advanceOrFinish (or goBack) twice before the
  // push/pop transition finishes — each extra firing would otherwise push
  // (or pop) a second time on top of the same still-mounted screen, reading
  // as a jump-forward-then-back flicker. Released shortly after the
  // navigation call fires, well past the ~300ms slide transition. advance and
  // back use SEPARATE locks (not one shared one) — an intentional "Continue
  // then immediately Back" is a normal, legitimate sequence and must not be
  // swallowed by the lock the Continue tap just set.
  const advancingRef = useRef(false);
  const backingRef = useRef(false);
  const guardNavigate = useCallback((lockRef: React.MutableRefObject<boolean>, fn: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    fn();
    setTimeout(() => { lockRef.current = false; }, 500);
  }, []);
  // Once the visible step actually changes, this screen has definitely moved
  // on — release both locks immediately rather than waiting on the timeout
  // above (which exists only as a fallback for paths where step.id doesn't
  // change, e.g. a failed finalize retry on the last step).
  useEffect(() => {
    advancingRef.current = false;
    backingRef.current = false;
  }, [step?.id]);

  const advanceOrFinish = useCallback(() => {
    if (!step) return;
    guardNavigate(advancingRef, () => {
      const next = nextStep(step.id);
      if (next) {
        send({ type: 'NEXT' });
        navigation.push('Step', { stepId: next });
      } else {
        send({ type: 'NEXT' }); // no-op at the last step, kept for symmetry/draft persistence
        void finalize();
      }
    });
  }, [step, send, navigation, finalize, guardNavigate]);

  const goBack = useCallback(() => {
    if (!step) return;
    const prev = previousStep(step.id);
    if (!prev) return;
    guardNavigate(backingRef, () => {
      send({ type: 'BACK' });
      // A resumed-mid-quiz session (app restart, or dev reload) mounts this
      // screen as the FIRST entry of a fresh navigator stack — the machine
      // still knows a previous question exists (so the back arrow shows),
      // but there's no push history to pop, and a bare goBack() would just
      // warn and do nothing. Swap the route directly in that case instead.
      // The pop-direction animation for that replace is declared statically
      // in QuizNavigator's screenOptions — setting it here, in the same tick
      // as the replace, did not apply in time and the "back" animated like a
      // forward push.
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('Step', { stepId: prev });
      }
    });
  }, [step, send, navigation, guardNavigate]);

  // Android hardware-back must route through goBack() (machine BACK + nav pop
  // together). A bare native pop leaves machine.stepId ahead of the route, so
  // the next persistDraft writes a stale lastRoute and the quiz resumes at the
  // wrong step after restart. On the first step (no prev), fall through to the
  // default (exit the quiz).
  useEffect(() => {
    const onBack = () => {
      if (finalizeState !== 'idle') return false;
      if (!step) return false;
      // Rapid Fire has no back navigation at all — mid-round there's nothing
      // sane to land on between two timed pairs, so hardware back is
      // swallowed here rather than falling through to the default (exit).
      if (step.kind === 'rapidFire') return true;
      if (!previousStep(step.id)) return false;
      goBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, finalizeState, goBack]);

  if (!step) return null; // unreachable: route params always come from getStep-validated ids

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

  if (isReferenceOnboardingStep(step.id)) {
    return (
      <ReferenceOnboardingTemplate
        step={step}
        value={answer}
        answers={state.answers}
        onAnswer={(nextValue) => {
          if (step.id === 'social_verification' && step.kind === 'socialVerification' && typeof nextValue === 'object' && nextValue !== null) {
            const links = nextValue as { linkedin?: unknown; instagram?: unknown };
            send({ type: 'ANSWER', key: step.linkedinAnswerKey, value: typeof links.linkedin === 'string' ? links.linkedin : '' });
            send({ type: 'ANSWER', key: step.instagramAnswerKey, value: typeof links.instagram === 'string' ? links.instagram : '' });
            return;
          }
          if (answerKey) send({ type: 'ANSWER', key: answerKey, value: nextValue });
        }}
        onContinue={advanceOrFinish}
        onBack={goBack}
      />
    );
  }

  switch (step.kind) {
    case 'intro':
      return <IntroTemplate step={step} onContinue={advanceOrFinish} onBack={previousStep(step.id) ? goBack : undefined} />;

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
        />
      );

    case 'opinions':
      return (
        <OpinionsTemplate
          step={step}
          submissionId={state.submissionId}
          onComplete={(picks, whys) => {
            send({ type: 'ANSWER', key: step.answerKey, value: picks });
            if (step.whyAnswerKey && whys.length > 0) {
              send({ type: 'ANSWER', key: step.whyAnswerKey, value: whys });
            }
            advanceOrFinish();
          }}
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
          headerVariant="counter"
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

    case 'socialVerification':
      return (
        <SocialVerificationTemplate
          step={step}
          linkedin={(state.answers[step.linkedinAnswerKey] as string) ?? ''}
          instagram={(state.answers[step.instagramAnswerKey] as string) ?? ''}
          onChangeLinkedin={(v) => send({ type: 'ANSWER', key: step.linkedinAnswerKey, value: v })}
          onChangeInstagram={(v) => send({ type: 'ANSWER', key: step.instagramAnswerKey, value: v })}
          onContinue={advanceOrFinish}
          onSkip={advanceOrFinish}
          onBack={previousStep(step.id) ? goBack : undefined}
        />
      );
  }
}
