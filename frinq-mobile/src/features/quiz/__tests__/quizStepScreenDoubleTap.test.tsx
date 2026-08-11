/**
 * Regression test for the "sudden next-page skip then jump back" glitch:
 * a double-tap (or any two rapid firings) of an immediate-advance option
 * used to call advanceOrFinish() twice before the first push transition
 * landed, pushing the same next step twice — QuizStepScreen.tsx's
 * navigatingRef guard should collapse that to a single push.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuizProvider } from '../quizContext';
import { QuizStepScreen } from '../screens/QuizStepScreen';
import { QuizDraftRepository, KeyValueStore } from '../../../storage/quizDraftRepository';
import { DEFAULT_CONTENT_STEPS } from '../domain/quizDefinition';

const FIRST_STEP = DEFAULT_CONTENT_STEPS.find((s) => s.kind === 'singleChoiceList' && s.chrome !== 'simple')!;

const mockRouteState = { stepId: FIRST_STEP.id };
const mockPush = jest.fn((_name: string, params: { stepId: string }) => {
  mockRouteState.stepId = params.stepId;
});
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), push: mockPush, goBack: mockGoBack }),
  useRoute: () => ({ params: { stepId: mockRouteState.stepId } }),
}));

jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => ({ apiClient: { request: jest.fn() } }),
}));

function fakeStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getString: (k) => (data.has(k) ? data.get(k)! : null),
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

describe('QuizStepScreen double-tap guard', () => {
  it('collapses two rapid selections of the same option into a single push', () => {
    const repo = new QuizDraftRepository({ store: fakeStore(), now: () => Date.now() });
    const screen = render(
      <QuizProvider
        submissionId="sub-1"
        userId="user-1"
        repo={repo}
        partialSave={async () => true}
        onQuizComplete={async () => true}
      >
        <QuizStepScreen />
      </QuizProvider>,
    );

    const optionLabel = (FIRST_STEP as { options: ReadonlyArray<{ label: string }> }).options[0].label;
    const option = screen.getByText(optionLabel);
    fireEvent.press(option);
    fireEvent.press(option);

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
