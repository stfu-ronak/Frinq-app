import { QueryClient } from '@tanstack/react-query';
import { SessionCoordinator } from '../../services/session/SessionCoordinator';
import { getEncryptedStore, resetEncryptedStore } from '../../storage/encryptedStorage';
import { QuizDraftRepository } from '../../storage/quizDraftRepository';
import { clearDraftEncryptionKey } from '../../storage/secureCredentials';
import { clearPendingQuizState } from '../quiz/pendingQuizState';
import { clearPendingAcceptance } from '../legal/pendingAcceptance';

/** Shared by logout and account deletion — both must leave NO local trace of
 *  the account: in-memory access token + secure refresh token, cached query
 *  state, and every key in the encrypted store (quiz draft + the pre-auth
 *  `pending_quiz_state`, which holds the typed name = PII, + pending legal
 *  acceptance). Finally shred the store's encryption key and drop the cached
 *  instance, so anything not explicitly removed is cryptographically orphaned
 *  rather than merely emptied. Realtime teardown and push deregistration
 *  aren't wired because neither exists yet (Tasks 37-38 / later) — they no-op
 *  by not existing, not by being skipped. */
export async function clearLocalSessionState(coordinator: SessionCoordinator, queryClient: QueryClient): Promise<void> {
  await coordinator.clear();
  queryClient.clear();

  // Remove every known key first (guaranteed-immediate, independent of the
  // key-shred below which only takes full effect on the next store open).
  const store = await getEncryptedStore();
  new QuizDraftRepository({ store, now: () => Date.now() }).clear();
  await clearPendingQuizState();
  await clearPendingAcceptance();

  // Shred: next getEncryptedStore() rebuilds with a fresh key over an empty
  // store; the old encrypted blob becomes undecryptable.
  await clearDraftEncryptionKey();
  resetEncryptedStore();
}
