import { FIXED_ANSWER_KEYS } from '../answerSchema';
import {
  DateStep,
  MultiChoiceTagsStep,
  SingleChoiceListStep,
  SocialVerificationStep,
  TextStep,
} from '../quizDefinition';

describe('Phase 6 quiz step contract', () => {
  it('supports the template presentation fields and fixed social-verification answer keys', () => {
    const text: TextStep = {
      id: 'name', kind: 'text', section: 'basics', answerKey: 'name', prompt: 'Name?',
      chrome: 'simple', showSkip: true,
    };
    const date: DateStep = {
      id: 'dob', kind: 'date', section: 'basics', answerKey: 'dob', prompt: 'DOB?',
      chrome: 'simple', showSkip: true,
    };
    const list: SingleChoiceListStep = {
      id: 'trip', kind: 'singleChoiceList', section: 'content', answerKey: 'trip', prompt: 'Trip?',
      options: [{ value: 'a', label: 'A' }], chrome: 'simple', variant: 'box',
    };
    const tags: MultiChoiceTagsStep = {
      id: 'scene', kind: 'multiChoiceTags', section: 'content', answerKey: 'scene', prompt: 'Scene?',
      options: ['A'], layout: 'list', allowCustom: true, customPlaceholder: 'Something else?',
    };
    const social: SocialVerificationStep = {
      id: 'social_verification', kind: 'socialVerification', section: 'basics',
      heading: 'Verify', chrome: 'simple', showSkip: true,
      linkedinAnswerKey: 'social_linkedin', instagramAnswerKey: 'social_instagram',
    };

    expect([text.chrome, date.showSkip, list.variant, tags.layout, tags.customPlaceholder]).toEqual([
      'simple', true, 'box', 'list', 'Something else?',
    ]);
    expect(FIXED_ANSWER_KEYS.has(social.linkedinAnswerKey)).toBe(true);
    expect(FIXED_ANSWER_KEYS.has(social.instagramAnswerKey)).toBe(true);
  });
});
