import { ApiClient } from '../../services/api/apiClient';
import { finalizeQuiz, QuizSubmitResult } from './quizSyncService';
import { validateAnswers } from '../../storage/quizDraftRepository';
import { LAST_STEP_ID, ANSWER_KEYS } from './domain/quizDefinition';

export type FinalizeOutcome =
  | { kind: 'success'; result: QuizSubmitResult }
  | { kind: 'invalid'; reason: string }
  | { kind: 'error' };

/**
 * Finalizes a submission exactly once. A repeated tap while a finalize is
 * already in flight returns the SAME in-flight promise rather than firing a
 * second network call — this is the only thing preventing duplicate durable
 * AI-insights work from a double-tap, since the server has no client-side
 * idempotency key to dedupe on for /quiz/submit.
 */
export class QuizSubmissionService {
  private inFlight: Promise<FinalizeOutcome> | null = null;

  constructor(private readonly apiClient: ApiClient) {}

  finalize(submissionId: string | null, answers: Record<string, unknown>): Promise<FinalizeOutcome> {
    if (this.inFlight) return this.inFlight;

    try {
      validateAnswers(answers);
    } catch (err) {
      return Promise.resolve({ kind: 'invalid', reason: err instanceof Error ? err.message : 'invalid' });
    }
    // Every ANSWER_KEYS entry must be present before the quiz can finalize —
    // a locally-corrupted or partially-recovered draft must not silently
    // submit an incomplete payload.
    const missing = [...ANSWER_KEYS].filter((k) => !(k in answers));
    if (missing.length > 0) {
      return Promise.resolve({ kind: 'invalid', reason: `missing_answers:${missing.join(',')}` });
    }

    this.inFlight = finalizeQuiz(this.apiClient, submissionId, answers, LAST_STEP_ID)
      .then((result): FinalizeOutcome => ({ kind: 'success', result }))
      .catch((): FinalizeOutcome => ({ kind: 'error' }))
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}
