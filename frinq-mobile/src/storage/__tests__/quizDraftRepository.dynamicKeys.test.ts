import { validateAnswers, setDynamicAnswerKeys } from '../quizDraftRepository';

describe('dynamic answer keys', () => {
  it('rejects an unregistered custom key by default', () => {
    expect(() => validateAnswers({ custom_favorite_meal: 'biryani' })).toThrow(/unknown_answer_key/);
  });

  it('accepts a key after it is registered via setDynamicAnswerKeys', () => {
    setDynamicAnswerKeys(['custom_favorite_meal']);
    expect(() => validateAnswers({ custom_favorite_meal: 'biryani' })).not.toThrow();
  });

  it('still rejects a key that was never registered', () => {
    setDynamicAnswerKeys(['custom_favorite_meal']);
    expect(() => validateAnswers({ totally_unknown: 'x' })).toThrow(/unknown_answer_key/);
  });
});
