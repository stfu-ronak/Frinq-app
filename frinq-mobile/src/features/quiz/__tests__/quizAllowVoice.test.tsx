import React from 'react';
import { render } from '@testing-library/react-native';
import { QuizProvider } from '../quizContext';
import { QuizStepScreen } from '../screens/QuizStepScreen';
import { DEFAULT_CONTENT_STEPS, setContentSteps } from '../domain/quizDefinition';
import { KeyValueStore, QuizDraftRepository } from '../../../storage/quizDraftRepository';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ push: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { stepId: 'custom_voice' } }),
}));

jest.mock('../components/VoiceAnswer', () => {
  const { Text } = require('react-native');
  return { VoiceAnswer: () => <Text>voice answer control</Text> };
});

function fakeStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

describe('admin-authored text steps with voice enabled', () => {
  afterEach(() => setContentSteps(DEFAULT_CONTENT_STEPS));

  it('uses the existing voice-or-text template', () => {
    setContentSteps([{
      id: 'custom_voice',
      kind: 'text',
      section: 'custom',
      answerKey: 'custom_voice',
      prompt: 'tell us what happened',
      allowVoice: true,
    }]);
    const repo = new QuizDraftRepository({ store: fakeStore(), now: () => Date.now() });

    const screen = render(
      <QuizProvider
        submissionId="submission-1"
        userId="user-1"
        repo={repo}
        partialSave={jest.fn().mockResolvedValue(true)}
        onQuizComplete={jest.fn().mockResolvedValue(true)}
      >
        <QuizStepScreen />
      </QuizProvider>,
    );

    expect(screen.getByText('voice answer control')).toBeTruthy();
    expect(screen.getByText('tell us what happened')).toBeTruthy();
  });
});
