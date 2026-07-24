import { getEncryptedStore } from '../../storage/encryptedStorage';

const KEY = 'pending_quiz_state';

/**
 * Pre-auth quiz state: only what's collected before an account exists
 * (`s0` has no answer; `name` does). Same pattern as
 * features/legal/pendingAcceptance.ts — held in the shared encrypted store,
 * flushed into the real per-user QuizDraftRepository once OTP verify creates
 * the account, then cleared. Never holds tokens or anything beyond these two
 * fields.
 */
export interface PendingQuizState {
  name?: string;
  /** Set once PhoneScreen's POST /api/v1/quiz/start succeeds. */
  submissionId?: string;
}

export async function savePendingQuizState(patch: Partial<PendingQuizState>): Promise<void> {
  const store = await getEncryptedStore();
  const current = await loadPendingQuizState();
  store.set(KEY, JSON.stringify({ ...current, ...patch }));
}

export async function loadPendingQuizState(): Promise<PendingQuizState | null> {
  const store = await getEncryptedStore();
  const raw = store.getString(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingQuizState;
  } catch {
    return null;
  }
}

export async function clearPendingQuizState(): Promise<void> {
  const store = await getEncryptedStore();
  store.remove(KEY);
}
