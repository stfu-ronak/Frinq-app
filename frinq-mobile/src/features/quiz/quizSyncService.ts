import { ApiClient } from '../../services/api/apiClient';

/**
 * Thin wrapper over the real quiz endpoints. All of these except startQuiz
 * require an authenticated session (get_current_account on the backend) —
 * confirmed against the live OpenAPI snapshot, not assumed.
 */

export interface QuizSubmitPayload {
  answers: Record<string, unknown>;
  is_complete: boolean;
  last_page: string;
  phone?: string;
}

export interface QuizSubmitResult {
  submission_id: string;
  status: string;
  job_id?: string | null;
}

/** POST /api/v1/quiz/start — the only quiz endpoint that ALSO works pre-auth.
 *  Auth is left on (the default): the client attaches a bearer token only when
 *  it has one, so this stays anonymous before OTP and identifies the caller
 *  after it. That matters because the quiz now starts after auth, and a row
 *  created without a user_id can never be completed (the backend's
 *  phone-backfill at OTP verify has already run by then). Reuses an existing
 *  non-terminal submission for the same phone if one exists. */
export async function startQuiz(apiClient: ApiClient, phone: string): Promise<{ submission_id: string }> {
  return apiClient.request({ path: '/api/v1/quiz/start', method: 'POST', body: { phone } });
}

/** PATCH /api/v1/quiz/partial/{id} — debounced local-edit sync. Never marks
 *  the submission complete. Authenticated. */
export async function partialSave(
  apiClient: ApiClient,
  submissionId: string,
  answers: Record<string, unknown>,
  lastPage: string,
): Promise<boolean> {
  await apiClient.request({
    path: `/api/v1/quiz/partial/${submissionId}`,
    method: 'PATCH',
    body: { answers, last_page: lastPage, is_complete: false } as QuizSubmitPayload,
  });
  return true;
}

/**
 * Finalize a submission exactly once. If `submissionId` is known, PATCH
 * complete (the owned, already-created submission); otherwise POST submit
 * (creates one). Both require auth and accept the same payload shape.
 */
export async function finalizeQuiz(
  apiClient: ApiClient,
  submissionId: string | null,
  answers: Record<string, unknown>,
  lastPage: string,
): Promise<QuizSubmitResult> {
  const body: QuizSubmitPayload = { answers, is_complete: true, last_page: lastPage };
  if (submissionId) {
    return apiClient.request<QuizSubmitResult>({ path: `/api/v1/quiz/complete/${submissionId}`, method: 'PATCH', body });
  }
  return apiClient.request<QuizSubmitResult>({ path: '/api/v1/quiz/submit', method: 'POST', body });
}

export interface QuizSummary {
  submission_id: string;
  status: string;
  archetype?: string;
  headline?: string;
  insights?: Array<{ label: string; text: string }>;
  [key: string]: unknown;
}

export async function fetchQuizSummary(apiClient: ApiClient, submissionId: string): Promise<QuizSummary> {
  return apiClient.request<QuizSummary>({ path: `/api/v1/quiz/summary/${submissionId}` });
}

export async function retryQuiz(apiClient: ApiClient, submissionId: string): Promise<QuizSubmitResult> {
  return apiClient.request<QuizSubmitResult>({ path: `/api/v1/quiz/${submissionId}/retry`, method: 'POST' });
}

/** POST /api/v1/voice — multipart upload of a recorded answer clip.
 *  Re-recording the same question overwrites the previous take (server-side
 *  upsert), so callers may call this again after a re-record with no
 *  client-side dedup needed. */
export async function uploadVoiceClip(
  apiClient: ApiClient,
  submissionId: string,
  questionKey: string,
  fileUri: string,
  durationSec: number,
): Promise<void> {
  const form = new FormData();
  form.append('submission_id', submissionId);
  form.append('question_key', questionKey);
  form.append('duration_sec', String(Math.round(durationSec)));
  form.append('audio', { uri: fileUri, name: 'clip.m4a', type: 'audio/mp4' } as unknown as Blob);
  await apiClient.request({ path: '/api/v1/voice', method: 'POST', body: form });
}

/** DELETE /api/v1/voice — removes a recorded clip server-side. Without this,
 *  "delete" only cleared local state and the clip stayed in voice_clips,
 *  still getting transcribed into the summary as if the person had answered
 *  by voice. */
export async function deleteVoiceClip(apiClient: ApiClient, submissionId: string, questionKey: string): Promise<void> {
  const query = `submission_id=${encodeURIComponent(submissionId)}&question_key=${encodeURIComponent(questionKey)}`;
  await apiClient.request({ path: `/api/v1/voice?${query}`, method: 'DELETE' });
}
