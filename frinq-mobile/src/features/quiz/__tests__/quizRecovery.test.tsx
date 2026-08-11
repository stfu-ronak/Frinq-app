/**
 * Recovery scenarios not already covered at the unit level:
 * - quizDraftRepository.test.ts already covers corrupt JSON / wrong user /
 *   unknown schema version quarantine.
 * - quizMachine.test.ts already covers a partialSave rejection being
 *   swallowed (offline edit never blocks navigation) and BACK/GOTO.
 * This file covers QuizNavigator's own resolution logic: resuming from an
 * existing local draft (process-kill/app-restart) vs falling back to a
 * fresh quiz/start when none exists (fresh install / cleared storage) —
 * and that a mid-quiz network failure during the final submit doesn't lose
 * the local draft (server conflict / retry-safe).
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuizNavigator } from '../../../navigation/QuizNavigator';
import { QuizDraftRepository, setDynamicAnswerKeys } from '../../../storage/quizDraftRepository';
import { QuizSubmissionService } from '../quizSubmissionService';
import { ANSWER_KEYS, DEFAULT_CONTENT_STEPS, setContentSteps } from '../domain/quizDefinition';

function fullAnswers(): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const key of ANSWER_KEYS) answers[key] = 'x';
  return answers;
}

const mockUseSession = jest.fn();
jest.mock('../../../services/session/sessionContext', () => ({
  useSession: () => mockUseSession(),
}));

let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};
jest.mock('../../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
}));

const mockStartQuiz = jest.fn();
jest.mock('../quizSyncService', () => {
  const actual = jest.requireActual('../quizSyncService');
  return {
    ...actual,
    startQuiz: (...args: unknown[]) => mockStartQuiz(...args),
    partialSave: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component, initialParams }: any) => <Component route={{ params: initialParams }} />,
  }),
}));

jest.mock('../screens/QuizStepScreen', () => {
  const { Text } = require('react-native');
  return { QuizStepScreen: ({ route }: any) => <Text testID="resolved-step">{route.params.stepId}</Text> };
});

const USER: any = { id: 'user-1', phone: '9876543210' };

let testQueryClient: QueryClient;

/** QuizNavigator shares its /users/me fetch with BootController via a
 *  react-query cache — a fresh client per test avoids one test's cached
 *  'currentUser' leaking into the next and skipping the mocked fetch. */
function renderNavigator(onQuizComplete: () => void) {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <QuizNavigator onQuizComplete={onQuizComplete} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
  testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  setContentSteps(DEFAULT_CONTENT_STEPS);
  setDynamicAnswerKeys([]);
});

describe('QuizNavigator resolution', () => {
  it('resumes from an existing local draft without calling quiz/start', async () => {
    const repo = new QuizDraftRepository({ store: mockStore, now: () => 1 });
    repo.save({ submissionId: 'sub-existing', userId: USER.id, lastRoute: 'age', answers: { city: 'Mumbai' } });

    const apiClient = { request: jest.fn().mockResolvedValue(USER) };
    mockUseSession.mockReturnValue({ apiClient });

    renderNavigator(jest.fn());

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith({ path: '/api/v1/users/me' }));
    expect(mockStartQuiz).not.toHaveBeenCalled();
  });

  it('falls back to quiz/start when no local draft exists (fresh install)', async () => {
    mockStartQuiz.mockResolvedValue({ submission_id: 'sub-new' });
    const apiClient = { request: jest.fn().mockResolvedValue(USER) };
    mockUseSession.mockReturnValue({ apiClient });

    renderNavigator(jest.fn());

    await waitFor(() => expect(mockStartQuiz).toHaveBeenCalledWith(apiClient, USER.phone));
  });

  it('shows a retryable error instead of an unhandled rejection when /users/me fails', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) };
    mockUseSession.mockReturnValue({ apiClient });

    const screen = renderNavigator(jest.fn());
    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy());
  });
});

describe('server-conflict / retry safety', () => {
  it('a finalize network failure leaves the local draft intact for a later retry', async () => {
    const store = { getString: (k: string) => mockStoreData.get(k) ?? null, set: (k: string, v: string) => void mockStoreData.set(k, v), remove: (k: string) => void mockStoreData.delete(k) };
    const repo = new QuizDraftRepository({ store, now: () => 1 });
    repo.save({ submissionId: 'sub-1', userId: USER.id, lastRoute: 'last_question', answers: { name: 'Ada' } });

    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('sub-1', fullAnswers());

    expect(outcome).toEqual({ kind: 'error' });
    expect(repo.load(USER.id)).not.toBeNull(); // draft survives a failed finalize, retry is possible
  });

  it('a 404 (wrong user/submission) is surfaced as an error outcome, not silently treated as success', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(Object.assign(new Error('not found'), { status: 404 })) };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('someone-elses-submission', fullAnswers());
    expect(outcome.kind).toBe('error');
  });
});
