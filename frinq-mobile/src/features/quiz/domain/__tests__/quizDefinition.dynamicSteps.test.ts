import {
  setContentSteps,
  getStep,
  nextStep,
  previousStep,
  currentLastStepId,
  FIRST_STEP_ID,
  ONBOARDING_PREFIX,
  DEFAULT_CONTENT_STEPS,
} from '../quizDefinition';

const CUSTOM = [
  { id: 'custom_1', kind: 'text', section: 'content', answerKey: 'custom_1', prompt: 'test?' },
] as const;

describe('dynamic content steps', () => {
  // Module state is per-test-file in jest, but reset anyway so later tests in
  // this file always start from the compiled-in default.
  afterEach(() => setContentSteps(DEFAULT_CONTENT_STEPS));

  it('getStep resolves a step from a freshly-set content array', () => {
    setContentSteps(CUSTOM);
    expect(getStep('custom_1')?.kind).toBe('text');
  });

  it('replaced content steps drop the old defaults', () => {
    setContentSteps(CUSTOM);
    expect(getStep('social_type')).toBeUndefined();
    expect(currentLastStepId()).toBe('custom_1');
  });

  it('nextStep chains from the onboarding prefix into the new content array', () => {
    setContentSteps(CUSTOM);
    const lastOnboardingId = ONBOARDING_PREFIX[ONBOARDING_PREFIX.length - 1].id;
    expect(nextStep(lastOnboardingId)).toBe('custom_1');
  });

  it('previousStep chains backward across the prefix/content boundary', () => {
    setContentSteps(CUSTOM);
    const lastOnboardingId = ONBOARDING_PREFIX[ONBOARDING_PREFIX.length - 1].id;
    expect(previousStep('custom_1')).toBe(lastOnboardingId);
  });

  it('FIRST_STEP_ID is unaffected by setContentSteps (onboarding always starts first)', () => {
    setContentSteps(CUSTOM);
    expect(FIRST_STEP_ID).toBe(ONBOARDING_PREFIX[0].id);
  });

  it('resetting to DEFAULT_CONTENT_STEPS restores the compiled-in tail', () => {
    setContentSteps(CUSTOM);
    setContentSteps(DEFAULT_CONTENT_STEPS);
    expect(getStep('social_type')?.id).toBe('social_type');
    expect(currentLastStepId()).toBe('last_question');
  });
});
