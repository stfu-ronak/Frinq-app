import {
  ONBOARDING_PREFIX,
  DEFAULT_CONTENT_STEPS,
  FIRST_STEP_ID,
  currentLastStepId,
  getStep,
  nextStep,
  previousStep,
  stepProgress,
  answerKeysForStep,
  ANSWER_KEYS,
  QuizStep,
} from '../domain/quizDefinition';

// The compiled-in default list this suite asserts over. No test here calls
// setContentSteps, so the module's active list stays equal to this.
const QUIZ_STEPS = [...ONBOARDING_PREFIX, ...DEFAULT_CONTENT_STEPS];
const LAST_STEP_ID = currentLastStepId();

describe('QUIZ_STEPS structure', () => {
  it('has unique step ids', () => {
    const ids = QUIZ_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique answer keys among answer-bearing steps', () => {
    const keys = QUIZ_STEPS.flatMap(answerKeysForStep);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every answer-bearing step key is in the shared ANSWER_KEYS allowlist', () => {
    const offenders = QUIZ_STEPS.filter((s) => {
      return answerKeysForStep(s).some((key) => !ANSWER_KEYS.has(key));
    });
    expect(offenders).toEqual([]);
  });

  it('every ANSWER_KEYS entry is covered by exactly one step', () => {
    const stepKeys = new Set(QUIZ_STEPS.flatMap(answerKeysForStep));
    for (const key of ANSWER_KEYS) {
      if (key === 'name') continue;
      expect(stepKeys.has(key)).toBe(true);
    }
  });

  it('permits the approved identity fields but excludes location collection and matching concepts', () => {
    const forbidden = /location|latitude|longitude|match|dm|photo|selfie/i;
    const keys = QUIZ_STEPS.flatMap(answerKeysForStep);
    for (const key of keys) {
      expect(key).not.toMatch(forbidden);
    }
  });
});

describe('navigation: reachability, no dead ends, first/last', () => {
  it('FIRST_STEP_ID is the array head and LAST_STEP_ID is the array tail', () => {
    expect(FIRST_STEP_ID).toBe(QUIZ_STEPS[0].id);
    expect(LAST_STEP_ID).toBe(QUIZ_STEPS[QUIZ_STEPS.length - 1].id);
  });

  it('every step is reachable from FIRST_STEP_ID by repeated nextStep()', () => {
    const visited = new Set<string>();
    let cur: string | null = FIRST_STEP_ID;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      cur = nextStep(cur);
    }
    expect(visited.size).toBe(QUIZ_STEPS.length);
  });

  it('no step is a dead end except the last (every non-last step has a next)', () => {
    for (const step of QUIZ_STEPS) {
      if (step.id === LAST_STEP_ID) {
        expect(nextStep(step.id)).toBeNull();
      } else {
        expect(nextStep(step.id)).not.toBeNull();
      }
    }
  });

  it('previousStep is the exact inverse of nextStep for every interior step, except stepping back over Rapid Fire', () => {
    for (let i = 1; i < QUIZ_STEPS.length; i++) {
      const id = QUIZ_STEPS[i].id;
      // Rapid Fire has no back navigation of its own — the step right after
      // it deliberately skips back past both the round and its intro
      // milestone instead of landing on either. Asserted explicitly below.
      if (QUIZ_STEPS[i - 1].kind === 'rapidFire') continue;
      expect(previousStep(id)).toBe(QUIZ_STEPS[i - 1].id);
    }
    expect(previousStep(FIRST_STEP_ID)).toBeNull();
  });

  it('stepping back from right after Rapid Fire skips both the round and its intro milestone', () => {
    const rapidFireIndex = QUIZ_STEPS.findIndex((s) => s.kind === 'rapidFire');
    const afterId = QUIZ_STEPS[rapidFireIndex + 1].id;
    expect(QUIZ_STEPS[rapidFireIndex - 1].kind).toBe('intro'); // sanity: rapid_intro precedes it
    expect(previousStep(afterId)).toBe(QUIZ_STEPS[rapidFireIndex - 2].id);
  });

  it('getStep resolves every id in the array and nothing else', () => {
    for (const step of QUIZ_STEPS) {
      expect(getStep(step.id)).toBe(step);
    }
    expect(getStep('not-a-real-step')).toBeUndefined();
  });
});

describe('stepProgress', () => {
  // Mirrors quizDefinition.ts's own unitsForStep — Rapid Fire counts once per
  // pair, Opinions counts once per pick PLUS once per pair with a whyPrompt,
  // Preferences counts once per slider.
  function unitsFor(s: QuizStep): number {
    if (s.kind === 'rapidFire') return s.pairs.length;
    if (s.kind === 'opinions') return s.pairs.length + s.pairs.filter((p) => p.whyPrompt).length;
    if (s.kind === 'preferences') return s.sliders.length;
    return 1;
  }

  it('counts only real quiz-content steps (never ONBOARDING_PREFIX), not intros, and is monotonic', () => {
    const inputSteps = DEFAULT_CONTENT_STEPS.filter((s) => s.kind !== 'intro');
    const total = inputSteps.reduce((sum, s) => sum + unitsFor(s), 0);
    const first = stepProgress(inputSteps[0].id);
    expect(first).toEqual({ step: 1, total });
    const last = stepProgress(inputSteps[inputSteps.length - 1].id);
    expect(last).toEqual({ step: total, total });
  });

  it('a rapidFire step counts one number PER PAIR via subIndex, shifting the total', () => {
    const rapidFire = DEFAULT_CONTENT_STEPS.find((s) => s.kind === 'rapidFire')!;
    if (rapidFire.kind !== 'rapidFire') throw new Error('unreachable');
    const introId = previousStep(rapidFire.id)!; // rapid_intro — an 'intro' step, not counted itself
    const before = stepProgress(previousStep(introId)!); // last real question before the rapid-fire section
    const firstPair = stepProgress(rapidFire.id, 0);
    const lastPair = stepProgress(rapidFire.id, rapidFire.pairs.length - 1);
    expect(firstPair.step).toBe(before.step + 1);
    expect(lastPair.step).toBe(before.step + rapidFire.pairs.length);
    expect(firstPair.total).toBe(lastPair.total);
  });

  it('an opinions step counts one number per pick PLUS one per why-followup, via subIndex', () => {
    // Computed directly from sequential array order (like production's own
    // stepProgress), not via previousStep — Rapid Fire's back-navigation
    // skip sits between 'opinions' and the nearest reachable-by-back
    // question, but still counts sequentially in between the two.
    const contentSteps = DEFAULT_CONTENT_STEPS.filter((s) => s.kind !== 'intro');
    const opinionsPos = contentSteps.findIndex((s) => s.kind === 'opinions');
    const opinions = contentSteps[opinionsPos];
    if (opinions.kind !== 'opinions') throw new Error('unreachable');
    const before = contentSteps.slice(0, opinionsPos).reduce((sum, s) => sum + unitsFor(s), 0);
    const units = unitsFor(opinions);
    const first = stepProgress(opinions.id, 0);
    const last = stepProgress(opinions.id, units - 1);
    expect(first.step).toBe(before + 1);
    expect(last.step).toBe(before + units);
    expect(first.total).toBe(last.total);
  });

  it('a preferences step counts one number per slider, via subIndex — regression: subIndex was never wired up, so every slider reported the same step number', () => {
    const contentSteps = DEFAULT_CONTENT_STEPS.filter((s) => s.kind !== 'intro');
    const prefsPos = contentSteps.findIndex((s) => s.kind === 'preferences');
    const preferences = contentSteps[prefsPos];
    if (preferences.kind !== 'preferences') throw new Error('unreachable');
    const before = contentSteps.slice(0, prefsPos).reduce((sum, s) => sum + unitsFor(s), 0);
    const units = unitsFor(preferences);
    expect(units).toBe(preferences.sliders.length);
    const first = stepProgress(preferences.id, 0);
    const last = stepProgress(preferences.id, units - 1);
    expect(first.step).toBe(before + 1);
    expect(last.step).toBe(before + units);
    expect(first.step).not.toBe(last.step); // each slider must report a distinct number
    expect(first.total).toBe(last.total);
  });

  it('an ONBOARDING_PREFIX step (not part of the quiz proper) reports step 0', () => {
    const onboarding = ONBOARDING_PREFIX.find((s) => s.kind !== 'intro')!;
    expect(stepProgress(onboarding.id).step).toBe(0);
  });

  it('an intro step reports step 0 (not part of the answer count)', () => {
    const intro = QUIZ_STEPS.find((s) => s.kind === 'intro')!;
    expect(stepProgress(intro.id).step).toBe(0);
  });
});
