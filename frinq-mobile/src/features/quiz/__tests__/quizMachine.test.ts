import { QuizMachine } from '../domain/quizMachine';
import { QuizDraftRepository, KeyValueStore } from '../../../storage/quizDraftRepository';
import { FIRST_STEP_ID } from '../domain/quizDefinition';

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

function machine(partialSave = jest.fn().mockResolvedValue(true), debounceMs = 50) {
  const repo = new QuizDraftRepository({ store: fakeStore(), now: () => 1000 });
  const m = QuizMachine.start(SUBMISSION, USER, repo, partialSave, debounceMs);
  return { m, repo, partialSave };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('QuizMachine.start', () => {
  it('starts fresh at FIRST_STEP_ID with no prior draft', () => {
    const { m } = machine();
    expect(m.getState()).toMatchObject({ stepId: FIRST_STEP_ID, answers: {}, submissionId: SUBMISSION });
  });

  it('resumes from a saved draft for the same submission+user', () => {
    const repo = new QuizDraftRepository({ store: fakeStore(), now: () => 1000 });
    repo.save({ submissionId: SUBMISSION, userId: USER, lastRoute: 'city', answers: { name: 'Ada' } });
    const m2 = QuizMachine.start(SUBMISSION, USER, repo, jest.fn().mockResolvedValue(true));
    expect(m2.getState()).toMatchObject({ stepId: 'city', answers: { name: 'Ada' }, submissionId: SUBMISSION });
  });

  it('ignores a draft belonging to a different submission id', () => {
    const repo = new QuizDraftRepository({ store: fakeStore(), now: () => 1000 });
    repo.save({ submissionId: 'other-sub', userId: USER, lastRoute: 'city', answers: { name: 'Ada' } });
    const m2 = QuizMachine.start(SUBMISSION, USER, repo, jest.fn().mockResolvedValue(true));
    expect(m2.getState()).toMatchObject({ stepId: FIRST_STEP_ID, answers: {} });
  });
});

describe('ANSWER / NEXT / BACK / GOTO', () => {
  it('ANSWER updates state and persists the draft immediately (synchronously)', () => {
    const { m, repo } = machine();
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    expect(m.getState().answers).toEqual({ name: 'Ada' });
    // Persisted synchronously — a fresh machine instance sees it without advancing timers.
    const resumed = QuizMachine.start(SUBMISSION, USER, repo, jest.fn().mockResolvedValue(true));
    expect(resumed.getState().answers).toEqual({ name: 'Ada' });
  });

  it('NEXT advances exactly one step and never blocks on the network', () => {
    const { m } = machine();
    const before = m.getState().stepId;
    m.send({ type: 'NEXT' });
    expect(m.getState().stepId).not.toBe(before);
  });

  it('NEXT at the last step is a no-op (screen handles submission itself)', () => {
    const { m } = machine();
    // Walk to the end.
    let guard = 0;
    while (guard++ < 100) {
      const cur = m.getState().stepId;
      m.send({ type: 'NEXT' });
      if (m.getState().stepId === cur) break;
    }
    const atEnd = m.getState().stepId;
    m.send({ type: 'NEXT' });
    expect(m.getState().stepId).toBe(atEnd);
  });

  it('BACK returns to the previous step and edits the SAME submission (no new id)', () => {
    const { m } = machine();
    m.send({ type: 'NEXT' });
    const afterNext = m.getState().submissionId;
    m.send({ type: 'BACK' });
    expect(m.getState().stepId).toBe(FIRST_STEP_ID);
    expect(m.getState().submissionId).toBe(afterNext);
  });

  it('BACK at the first step is a no-op', () => {
    const { m } = machine();
    m.send({ type: 'BACK' });
    expect(m.getState().stepId).toBe(FIRST_STEP_ID);
  });

  it('GOTO an unknown step id is ignored', () => {
    const { m } = machine();
    m.send({ type: 'GOTO', stepId: 'nonexistent' });
    expect(m.getState().stepId).toBe(FIRST_STEP_ID);
  });

  it('GOTO a known step id jumps directly', () => {
    const { m } = machine();
    m.send({ type: 'GOTO', stepId: 'city' });
    expect(m.getState().stepId).toBe('city');
  });
});

describe('debounced server sync', () => {
  it('does not call partialSave synchronously on ANSWER', () => {
    const { m, partialSave } = machine();
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    expect(partialSave).not.toHaveBeenCalled();
  });

  it('calls partialSave once after the debounce window, with the current state', () => {
    const { m, partialSave } = machine(jest.fn().mockResolvedValue(true), 50);
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    jest.advanceTimersByTime(60);
    expect(partialSave).toHaveBeenCalledWith(SUBMISSION, { name: 'Ada' }, FIRST_STEP_ID);
  });

  it('rapid successive answers collapse into a single debounced call', () => {
    const { m, partialSave } = machine(jest.fn().mockResolvedValue(true), 50);
    m.send({ type: 'ANSWER', key: 'name', value: 'A' });
    jest.advanceTimersByTime(20);
    m.send({ type: 'ANSWER', key: 'name', value: 'Ad' });
    jest.advanceTimersByTime(20);
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    jest.advanceTimersByTime(60);
    expect(partialSave).toHaveBeenCalledTimes(1);
    expect(partialSave).toHaveBeenCalledWith(SUBMISSION, { name: 'Ada' }, FIRST_STEP_ID);
  });

  it('a partialSave rejection is swallowed — never surfaces as an unhandled rejection', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('network'));
    const { m } = machine(failing, 10);
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    jest.advanceTimersByTime(20);
    await Promise.resolve(); // let the rejected promise's .catch run
    expect(failing).toHaveBeenCalled();
  });

  it('flush() cancels the pending debounce and syncs immediately', async () => {
    const { m, partialSave } = machine(jest.fn().mockResolvedValue(true), 5000);
    m.send({ type: 'ANSWER', key: 'name', value: 'Ada' });
    await m.flush();
    expect(partialSave).toHaveBeenCalledWith(SUBMISSION, { name: 'Ada' }, FIRST_STEP_ID);
  });
});
