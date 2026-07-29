import { ONBOARDING_PREFIX } from '../quizDefinition';

describe('reference onboarding sequence', () => {
  it('keeps the supplied screens ahead of dynamic questions', () => {
    expect(ONBOARDING_PREFIX.map((step) => step.id)).toEqual([
      'welcome', 'gender', 'pronoun', 'city', 'age', 'social_verification', 'ready',
    ]);
  });
});
