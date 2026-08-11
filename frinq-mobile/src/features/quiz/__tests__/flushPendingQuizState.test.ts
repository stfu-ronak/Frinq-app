import { flushPendingQuizState } from '../flushPendingQuizState';
import * as pendingQuizState from '../pendingQuizState';
import * as quizSyncService from '../quizSyncService';
import * as encryptedStorage from '../../../storage/encryptedStorage';
import { QuizDraftRepository } from '../../../storage/quizDraftRepository';

jest.mock('../pendingQuizState');
jest.mock('../quizSyncService');
jest.mock('../../../storage/encryptedStorage');

const mockLoad = pendingQuizState.loadPendingQuizState as jest.Mock;
const mockClear = pendingQuizState.clearPendingQuizState as jest.Mock;
const mockStartQuiz = quizSyncService.startQuiz as jest.Mock;
const mockGetStore = encryptedStorage.getEncryptedStore as jest.Mock;

function fakeStore() {
  const data = new Map<string, string>();
  return {
    data,
    getString: (k: string) => (data.has(k) ? data.get(k)! : null),
    set: (k: string, v: string) => void data.set(k, v),
    remove: (k: string) => void data.delete(k),
  };
}

const apiClient = { request: jest.fn() } as any;
const USER = 'user-1';
const PHONE = '9876543210';

beforeEach(() => {
  jest.clearAllMocks();
  mockClear.mockResolvedValue(undefined);
});

describe('flushPendingQuizState', () => {
  it('does nothing when there is neither a pending name nor a prior_session', async () => {
    mockLoad.mockResolvedValue(null);
    const store = fakeStore();
    mockGetStore.mockResolvedValue(store);
    await flushPendingQuizState(apiClient, USER, PHONE, null);
    expect(store.data.size).toBe(0);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('saves a fresh draft from the pending name + its stashed submissionId', async () => {
    mockLoad.mockResolvedValue({ name: 'Ada', submissionId: 'sub-1' });
    const store = fakeStore();
    mockGetStore.mockResolvedValue(store);

    await flushPendingQuizState(apiClient, USER, PHONE, null);

    const repo = new QuizDraftRepository({ store, now: () => 1 });
    const draft = repo.load(USER);
    // A brand-new signup starts at the very FIRST step. This previously
    // asserted 'city', which was the symptom of a real bug: the old
    // `nextStep('name')` lookup could never resolve ('name' isn't a quiz
    // step) so it always fell through to the 'city' fallback, skipping the
    // welcome/gender/pronoun screens entirely.
    expect(draft).toMatchObject({ submissionId: 'sub-1', userId: USER, lastRoute: 'welcome', answers: { name: 'Ada' } });
    expect(mockStartQuiz).not.toHaveBeenCalled(); // submissionId already known, no fallback needed
    expect(mockClear).toHaveBeenCalled();
  });

  it('the freshly-typed name overrides the same field in a prior_session', async () => {
    mockLoad.mockResolvedValue({ name: 'Ada', submissionId: 'sub-1' });
    const store = fakeStore();
    mockGetStore.mockResolvedValue(store);

    await flushPendingQuizState(apiClient, USER, PHONE, {
      submission_id: 'sub-1', answers: { name: 'OldName', city: 'Delhi' }, last_page: 'age',
    });

    const repo = new QuizDraftRepository({ store, now: () => 1 });
    const draft = repo.load(USER);
    expect(draft?.answers).toEqual({ name: 'Ada', city: 'Delhi' }); // name overridden, city preserved
    expect(draft?.lastRoute).toBe('age'); // resumes further along per prior_session, not reset to 'city'
  });

  it('falls back to a fresh quiz/start when no submissionId is known from either source', async () => {
    mockLoad.mockResolvedValue({ name: 'Ada' }); // no submissionId (PhoneScreen's fire-and-forget never landed)
    mockStartQuiz.mockResolvedValue({ submission_id: 'sub-new' });
    const store = fakeStore();
    mockGetStore.mockResolvedValue(store);

    await flushPendingQuizState(apiClient, USER, PHONE, null);

    expect(mockStartQuiz).toHaveBeenCalledWith(apiClient, PHONE);
    const repo = new QuizDraftRepository({ store, now: () => 1 });
    expect(repo.load(USER)?.submissionId).toBe('sub-new');
  });

  it('resumes from prior_session alone when there is no pending name (e.g. re-verifying on a new device)', async () => {
    mockLoad.mockResolvedValue(null);
    const store = fakeStore();
    mockGetStore.mockResolvedValue(store);

    await flushPendingQuizState(apiClient, USER, PHONE, {
      submission_id: 'sub-old', answers: { name: 'Ada', city: 'Mumbai' }, last_page: 'age',
    });

    const repo = new QuizDraftRepository({ store, now: () => 1 });
    const draft = repo.load(USER);
    expect(draft).toMatchObject({ submissionId: 'sub-old', lastRoute: 'age', answers: { name: 'Ada', city: 'Mumbai' } });
  });
});
