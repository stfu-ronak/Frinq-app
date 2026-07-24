import { ApiClient } from '../../services/api/apiClient';
import { PriorSession } from '../../services/api/contracts';
import { QuizDraftRepository } from '../../storage/quizDraftRepository';
import { getEncryptedStore } from '../../storage/encryptedStorage';
import { loadPendingQuizState, clearPendingQuizState } from './pendingQuizState';
import { startQuiz } from './quizSyncService';
import { nextStep } from './domain/quizDefinition';

/**
 * Runs immediately after OTP verify creates/resumes the account. Merges the
 * pre-auth `name` answer (freshly typed this session, so it wins) with any
 * `prior_session` the server already had for this phone/account, then saves
 * it into the real per-user encrypted quiz draft and clears the pre-auth
 * holder. Never leaves the quiz without a submission id: falls back to a
 * synchronous quiz/start if the fire-and-forget one from PhoneScreen never
 * landed (and there's no prior_session to source one from either).
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

  const lastRoute = priorSession?.last_page && priorSession.last_page !== 'name'
    ? priorSession.last_page
    : nextStep('name') ?? 'city';

  const store = await getEncryptedStore();
  const repo = new QuizDraftRepository({ store, now: () => Date.now() });
  repo.save({ submissionId, userId, lastRoute, answers });

  await clearPendingQuizState();
}
