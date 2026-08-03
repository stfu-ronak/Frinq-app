import { QuizSubmissionService } from '../quizSubmissionService';
import { ANSWER_KEYS, DEFAULT_CONTENT_STEPS, setContentSteps } from '../domain/quizDefinition';
import { setDynamicAnswerKeys } from '../../../storage/quizDraftRepository';

function fullAnswers(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const key of ANSWER_KEYS) answers[key] = key === 'rapid' || key === 'opinions' || key === 'preferences' ? ['x'] : 'x';
  return { ...answers, ...overrides };
}

describe('QuizSubmissionService', () => {
  it('rejects a payload missing required answer keys without calling the API', async () => {
    const apiClient = { request: jest.fn() };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('sub-1', { name: 'Ada' });
    expect(outcome.kind).toBe('invalid');
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('rejects an unknown answer key', async () => {
    const apiClient = { request: jest.fn() };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('sub-1', fullAnswers({ evil: 'x' }));
    expect(outcome.kind).toBe('invalid');
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('finalizes using the active content answer keys instead of compiled-in defaults', async () => {
    const activeSteps = [{ id: 'custom', kind: 'text', section: 'custom', answerKey: 'custom_answer', prompt: 'custom?' }] as const;
    setContentSteps(activeSteps);
    setDynamicAnswerKeys(['custom_answer']);
    const apiClient = { request: jest.fn().mockResolvedValue({ submission_id: 'sub-1', status: 'pending' }) };
    const svc = new QuizSubmissionService(apiClient as any);

    const outcome = await svc.finalize('sub-1', {
      name: 'Ada', gender: 'female', pronoun: 'she/her', city: 'Mumbai', dob: '14/03/1999',
      social_linkedin: '', social_instagram: '', custom_answer: 'yes',
    });

    expect(outcome.kind).toBe('success');
    setContentSteps(DEFAULT_CONTENT_STEPS);
    setDynamicAnswerKeys([]);
  });

  it('calls PATCH complete when a submissionId is known', async () => {
    const apiClient = { request: jest.fn().mockResolvedValue({ submission_id: 'sub-1', status: 'pending' }) };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('sub-1', fullAnswers());
    expect(outcome).toEqual({ kind: 'success', result: { submission_id: 'sub-1', status: 'pending' } });
    expect(apiClient.request).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/v1/quiz/complete/sub-1', method: 'PATCH' }));
  });

  it('falls back to POST submit when submissionId is null', async () => {
    const apiClient = { request: jest.fn().mockResolvedValue({ submission_id: 'sub-2', status: 'pending' }) };
    const svc = new QuizSubmissionService(apiClient as any);
    await svc.finalize(null, fullAnswers());
    expect(apiClient.request).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/v1/quiz/submit', method: 'POST' }));
  });

  it('a network failure resolves to an error outcome, not a thrown rejection', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) };
    const svc = new QuizSubmissionService(apiClient as any);
    const outcome = await svc.finalize('sub-1', fullAnswers());
    expect(outcome).toEqual({ kind: 'error' });
  });

  it('a repeated call while one is in flight returns the SAME promise (no duplicate network call)', async () => {
    let resolveRequest: (v: unknown) => void = () => {};
    const apiClient = { request: jest.fn(() => new Promise((resolve) => { resolveRequest = resolve; })) };
    const svc = new QuizSubmissionService(apiClient as any);

    const first = svc.finalize('sub-1', fullAnswers());
    const second = svc.finalize('sub-1', fullAnswers());
    expect(apiClient.request).toHaveBeenCalledTimes(1); // single-flight, not two calls

    resolveRequest({ submission_id: 'sub-1', status: 'pending' });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
  });

  it('a new finalize call after the previous one settles fires a fresh request', async () => {
    const apiClient = { request: jest.fn().mockResolvedValue({ submission_id: 'sub-1', status: 'pending' }) };
    const svc = new QuizSubmissionService(apiClient as any);
    await svc.finalize('sub-1', fullAnswers());
    await svc.finalize('sub-1', fullAnswers());
    expect(apiClient.request).toHaveBeenCalledTimes(2);
  });
});
