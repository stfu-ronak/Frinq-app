import { QuizDraftRepository, KeyValueStore, DRAFT_KEY, DRAFT_SCHEMA_VERSION, LIMITS } from '../quizDraftRepository';

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
function repo(store = fakeStore()) {
  return { store, repo: new QuizDraftRepository({ store, now: () => 1000 }) };
}

describe('QuizDraftRepository', () => {
  it('saves and loads a valid draft for the same user', () => {
    const { repo: r } = repo();
    r.save({ submissionId: 's1', userId: USER, lastRoute: '/city', answers: { name: 'Ada', hobbies: ['art', 'code'] } });
    const loaded = r.load(USER);
    expect(loaded).toMatchObject({ submissionId: 's1', userId: USER, lastRoute: '/city', schemaVersion: DRAFT_SCHEMA_VERSION, updatedAt: 1000 });
  });

  it('returns null and clears on a different user (account change)', () => {
    const { store, repo: r } = repo();
    r.save({ submissionId: 's1', userId: USER, lastRoute: '/city', answers: {} });
    expect(r.load('someone-else')).toBeNull();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });

  it('quarantines an unknown/newer schema version', () => {
    const { store, repo: r } = repo();
    store.set(DRAFT_KEY, JSON.stringify({ schemaVersion: 999, submissionId: 's', userId: USER, lastRoute: '/', answers: {}, updatedAt: 1 }));
    expect(r.load(USER)).toBeNull();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });

  it('returns null and clears on corrupt JSON', () => {
    const { store, repo: r } = repo();
    store.set(DRAFT_KEY, '{not json');
    expect(r.load(USER)).toBeNull();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });

  it('rejects an unknown answer key', () => {
    const { repo: r } = repo();
    expect(() => r.save({ submissionId: 's', userId: USER, lastRoute: '/', answers: { evil: 'x' } })).toThrow(/unknown_answer_key/);
  });

  it('rejects an oversized string and oversized array', () => {
    const { repo: r } = repo();
    expect(() => r.save({ submissionId: 's', userId: USER, lastRoute: '/', answers: { story: 'x'.repeat(LIMITS.maxStringLen + 1) } })).toThrow(/oversized/);
    expect(() => r.save({ submissionId: 's', userId: USER, lastRoute: '/', answers: { hobbies: Array(LIMITS.maxArrayLen + 1).fill('a') } })).toThrow(/oversized/);
  });

  it('clear() removes the draft', () => {
    const { store, repo: r } = repo();
    r.save({ submissionId: 's', userId: USER, lastRoute: '/', answers: {} });
    r.clear();
    expect(store.data.has(DRAFT_KEY)).toBe(false);
  });
});
