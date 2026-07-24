import React from 'react';
import { render, waitFor, fireEvent, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcessingScreen } from '../screens/ProcessingScreen';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';

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

const mockFetchQuizSummary = jest.fn();
const mockRetryQuiz = jest.fn();
jest.mock('../../quiz/quizSyncService', () => ({
  fetchQuizSummary: (...args: unknown[]) => mockFetchQuizSummary(...args),
  retryQuiz: (...args: unknown[]) => mockRetryQuiz(...args),
}));

const USER = { id: 'user-1', phone: '9876543210' };

function renderScreen(onComplete = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ProcessingScreen onComplete={onComplete} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
  const repo = new QuizDraftRepository({ store: mockStore, now: () => 1 });
  repo.save({ submissionId: 'sub-1', userId: USER.id, lastRoute: 'story', answers: {} });
  mockUseSession.mockReturnValue({ apiClient: { request: jest.fn().mockResolvedValue(USER) } });
});

describe('ProcessingScreen', () => {
  it('shows the building-your-vibe state while pending', async () => {
    mockFetchQuizSummary.mockResolvedValue({ submission_id: 'sub-1', status: 'pending' });

    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText(/Building your vibe/i)).toBeTruthy());
  });

  it('calls onComplete once the job reports done', async () => {
    mockFetchQuizSummary.mockResolvedValue({ submission_id: 'sub-1', status: 'done' });
    const onComplete = jest.fn();

    renderScreen(onComplete);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('shows a retry affordance when the job errors, and re-enqueues on retry', async () => {
    mockFetchQuizSummary.mockResolvedValue({ submission_id: 'sub-1', status: 'error' });
    mockRetryQuiz.mockResolvedValue({ submission_id: 'sub-1', status: 'pending', job_id: 'j-2' });

    const { getByRole } = renderScreen();

    const retryButton = await waitFor(() => getByRole('button', { name: /try again/i }));
    fireEvent.press(retryButton);

    await waitFor(() => expect(mockRetryQuiz).toHaveBeenCalledWith(expect.anything(), 'sub-1'));
  });

  it('shows a recoverable error when no local draft/submission id can be found', async () => {
    mockStoreData = new Map(); // no draft saved for this user

    const { getByRole } = renderScreen();

    await waitFor(() => expect(getByRole('alert')).toBeTruthy());
    expect(mockFetchQuizSummary).not.toHaveBeenCalled();
  });

  it('shows a retryable error when the summary fetch itself fails (not a domain status:error)', async () => {
    mockFetchQuizSummary.mockRejectedValue(new Error('network'));

    const { findByRole, getByText } = renderScreen();

    const alert = await findByRole('alert');
    // Previously this had no branch for a rejected fetch and fell through to
    // "Building your vibe…" forever — the fix surfaces a real retry affordance.
    expect(getByText(/couldn't check on your vibe report/i)).toBeTruthy();

    mockFetchQuizSummary.mockResolvedValue({ submission_id: 'sub-1', status: 'pending' });
    fireEvent.press(within(alert).getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(getByText(/Building your vibe/i)).toBeTruthy());
  });
});
