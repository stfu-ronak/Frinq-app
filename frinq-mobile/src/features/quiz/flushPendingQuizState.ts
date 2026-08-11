import { ApiClient } from '../../services/api/apiClient';
import { PriorSession } from '../../services/api/contracts';
import { QuizDraftRepository } from '../../storage/quizDraftRepository';
import { getEncryptedStore } from '../../storage/encryptedStorage';
import { loadPendingQuizState, clearPendingQuizState } from './pendingQuizState';
import { startQuiz } from './quizSyncService';
import { FIRST_STEP_ID } from './domain/quizDefinition';

/**
 * Runs immediately after OTP verify creates/resumes the account. Merges the
 * pre-auth `name` answer (freshly typed this session, so it wins) with any
 * `prior_session` the server already had for this phone/account, then saves
 * it into the real per-user encrypted quiz draft and clears the pre-auth
 * holder. Never leaves the quiz without a submission id: starts the quiz
 * only after OTP establishes the authenticated account when no prior session
 * can supply one.
 */
export async function flushPendingQuizState(
  apiClient: ApiClient,
  userId: string,
  phone: string,
  priorSession: PriorSession | null | undefined,
): Promise<void> {
  const pending = await loadPendingQuizState();
  if (!pending && !priorSession) return; // nothing to flush, nothing to resume

  const baseAnswers = priorSession?.answers ?? {};
  const name = pending?.name;
  const answers = name ? { ...baseAnswers, name } : baseAnswers;

  let submissionId = pending?.submissionId ?? priorSession?.submission_id ?? null;
  if (!submissionId) {
    const started = await startQuiz(apiClient, phone);
    submissionId = started.submission_id;
  }

  // A genuinely resuming account picks up where it left off; a brand-new one
  // starts at the very first step. This used to read `nextStep('name')`, but
  // 'name' is collected outside the quiz step list, so that lookup always
  // returned null and fell through to 'city' — silently skipping the welcome
  // screen (and gender/pronoun) for every new signup.
  const lastRoute = priorSession?.last_page && priorSession.last_page !== 'name'
    ? priorSession.last_page
    : FIRST_STEP_ID;

  const store = await getEncryptedStore();
  const repo = new QuizDraftRepository({ store, now: () => Date.now() });
  repo.save({ submissionId, userId, lastRoute, answers });

  await clearPendingQuizState();
}
