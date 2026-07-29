/**
 * Full-journey integration test: drives the real registry (QuizStepScreen),
 * the real templates, and the real QuizMachine from `city` (QuizNavigator's
 * entry point for an authenticated session — `s0`/`name` are pre-auth, see
 * docs/route-parity-matrix.md's Task 31 update) through to `last_question`.
 *
 * Navigation is mocked to a simple "current stepId" ref rather than mounting
 * a real multi-screen native-stack: production keeps QuizProvider mounted
 * once while Stack.Navigator pushes a new Step screen per step, so the
 * fidelity that matters — one shared QuizMachine instance across every
 * step, real template interactions, real answer persistence — is preserved;
 * a real push-based stack would leave every prior screen still mounted in
 * the test tree (native-stack defers unmounting), making queries ambiguous
 * without adding any coverage this doesn't already give.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuizProvider } from '../quizContext';
import { QuizStepScreen } from '../screens/QuizStepScreen';
import { QuizDraftRepository, KeyValueStore } from '../../../storage/quizDraftRepository';
import { ONBOARDING_PREFIX, DEFAULT_CONTENT_STEPS, ANSWER_KEYS, QuizStep } from '../domain/quizDefinition';

// The compiled-in default list; this suite never calls setContentSteps.
const QUIZ_STEPS = [...ONBOARDING_PREFIX, ...DEFAULT_CONTENT_STEPS];

const mockRouteState = { stepId: 'city' };
const mockNavigate = jest.fn();
const mockPush = jest.fn((_name: string, params: { stepId: string }) => {
  mockRouteState.stepId = params.stepId;
});
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, push: mockPush, goBack: mockGoBack }),
  useRoute: () => ({ params: { stepId: mockRouteState.stepId } }),
}));

// The 'story' step's VoiceOrTextTemplate renders VoiceAnswer, which needs a
// session for its (untested-here) upload path — the journey test only drives
// the typed-answer flow, so a minimal stub is enough.
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

const USER = 'user-1';
const SUBMISSION = 'sub-1';

/** Drives whichever template is on screen with a valid answer + advances. */
function driveStep(screen: ReturnType<typeof render>, step: QuizStep) {
  switch (step.kind) {
    case 'intro':
      fireEvent.press(screen.getByRole('button', { name: step.id === 'ready' ? 'Hell yeah! 🔥' : step.ctaLabel }));
      return;
    case 'text':
      if (step.id === 'city') {
        fireEvent.changeText(screen.getByLabelText('City'), 'Mumbai');
        fireEvent.press(screen.getByRole('button', { name: 'Continue city' }));
      } else {
        fireEvent.changeText(screen.getByLabelText(step.prompt), 'Test Answer');
        fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      }
      return;
    case 'date':
      if (step.id === 'age') {
        fireEvent.changeText(screen.getByLabelText('Birthday'), '14/03/1999');
        fireEvent.press(screen.getByRole('button', { name: 'Continue birthday' }));
      } else {
        fireEvent.changeText(screen.getByLabelText('day'), '14');
        fireEvent.changeText(screen.getByLabelText('month'), '03');
        fireEvent.changeText(screen.getByLabelText('year'), '1999');
        fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      }
      return;
    case 'singleChoiceCard':
      fireEvent.press(screen.getByText(step.options[0].label));
      return;
    case 'singleChoiceList':
      fireEvent.press(screen.getByText(step.options[0].label));
      if (step.chrome === 'simple') fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      return;
    case 'multiChoiceTags':
      fireEvent.press(screen.getByText(step.options[0]));
      fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      return;
    case 'rapidFire':
      for (const pair of step.pairs) {
        fireEvent.press(screen.getByText(pair.a));
        fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      }
      return;
    case 'opinions':
      for (const pair of step.pairs) fireEvent.press(screen.getByText(pair.a));
      return;
    case 'preferences':
      for (let i = 0; i < step.sliders.length; i++) {
        fireEvent.press(screen.getAllByLabelText('middle')[i]);
      }
      fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      return;
    case 'voiceOrText':
      fireEvent.changeText(screen.getByLabelText(step.heading), 'a short answer');
      fireEvent.press(screen.getByRole('button', { name: 'continue' }));
      return;
    case 'socialVerification':
      fireEvent.changeText(screen.getByLabelText(step.id === 'social_verification' ? 'LinkedIn profile' : 'your LinkedIn profile'), 'linkedin.com/in/test');
      fireEvent.changeText(screen.getByLabelText(step.id === 'social_verification' ? 'Instagram profile' : 'your Instagram profile'), '@test');
      fireEvent.press(screen.getByRole('button', { name: step.id === 'social_verification' ? 'Continue social verification' : 'continue' }));
      return;
  }
}

describe('quiz journey: city through last_question', () => {
  it('walks every remaining step, persisting a complete answer set, and calls onQuizComplete once', () => {
    mockRouteState.stepId = 'city';
    const store = fakeStore();
    const repo = new QuizDraftRepository({ store, now: () => Date.now() });
    const partialSave = jest.fn().mockResolvedValue(true);
    const onQuizComplete = jest.fn().mockResolvedValue(true);

    const screen = render(
      <QuizProvider submissionId={SUBMISSION} userId={USER} repo={repo} partialSave={partialSave} onQuizComplete={onQuizComplete}>
        <QuizStepScreen />
      </QuizProvider>,
    );

    const journeySteps = QUIZ_STEPS.slice(QUIZ_STEPS.findIndex((s) => s.id === 'city'));

    for (const step of journeySteps) {
      driveStep(screen, step);
    }

    expect(onQuizComplete).toHaveBeenCalledTimes(1);

    const draft = repo.load(USER);
    expect(draft).not.toBeNull();
    for (const key of ANSWER_KEYS) {
      // Name is pre-OTP; this journey begins at city, after the identity pages.
      if (key === 'name' || key === 'gender' || key === 'pronoun') continue;
      expect(draft!.answers[key]).toBeDefined();
    }
  });

  it('BACK from the second step returns to the first without creating a new submission', () => {
    mockRouteState.stepId = 'city';
    const store = fakeStore();
    const repo = new QuizDraftRepository({ store, now: () => Date.now() });
    const partialSave = jest.fn().mockResolvedValue(true);

    const screen = render(
      <QuizProvider submissionId={SUBMISSION} userId={USER} repo={repo} partialSave={partialSave} onQuizComplete={jest.fn()}>
        <QuizStepScreen />
      </QuizProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('City'), 'Mumbai');
    fireEvent.press(screen.getByRole('button', { name: 'Continue city' })); // -> age
    mockRouteState.stepId = 'age';
    screen.rerender(
      <QuizProvider submissionId={SUBMISSION} userId={USER} repo={repo} partialSave={partialSave} onQuizComplete={jest.fn()}>
        <QuizStepScreen />
      </QuizProvider>,
    );

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockGoBack).toHaveBeenCalled();
    expect(repo.load(USER)?.submissionId).toBe(SUBMISSION); // same submission, not a new one
  });
});
