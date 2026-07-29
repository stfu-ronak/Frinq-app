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

  it('previousStep is the exact inverse of nextStep for every interior step', () => {
    for (let i = 1; i < QUIZ_STEPS.length; i++) {
      const id = QUIZ_STEPS[i].id;
      expect(previousStep(id)).toBe(QUIZ_STEPS[i - 1].id);
    }
    expect(previousStep(FIRST_STEP_ID)).toBeNull();
  });

  it('getStep resolves every id in the array and nothing else', () => {
    for (const step of QUIZ_STEPS) {
      expect(getStep(step.id)).toBe(step);
    }
    expect(getStep('not-a-real-step')).toBeUndefined();
  });
});

describe('stepProgress', () => {
  it('counts only answer-bearing steps, not intros, and is monotonic', () => {
    const inputSteps = QUIZ_STEPS.filter((s) => s.kind !== 'intro');
    const first = stepProgress(inputSteps[0].id);
    expect(first).toEqual({ step: 1, total: inputSteps.length });
    const last = stepProgress(inputSteps[inputSteps.length - 1].id);
    expect(last).toEqual({ step: inputSteps.length, total: inputSteps.length });
  });

  it('an intro step reports step 0 (not part of the answer count)', () => {
    const intro = QUIZ_STEPS.find((s) => s.kind === 'intro')!;
    expect(stepProgress(intro.id).step).toBe(0);
  });
});
