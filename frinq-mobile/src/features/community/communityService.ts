import { ApiClient } from '../../services/api/apiClient';

/** Matches app/schemas/message.py's ReportReason exactly. */
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'self_harm'
  | 'violence'
  | 'impersonation'
  | 'privacy'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'spam',
  harassment: 'harassment',
  hate: 'hate speech',
  sexual: 'sexual content',
  self_harm: 'self-harm',
  violence: 'violence',
  impersonation: 'impersonation',
  privacy: 'privacy violation',
  other: 'other',
};

/** POST /messages/{id}/report — idempotent, neutral acknowledgement only
 *  (never promise a specific enforcement outcome). */
export async function reportMessage(
  apiClient: ApiClient,
  messageId: number,
  reason: ReportReason,
  details?: string,
): Promise<void> {
  await apiClient.request({
    path: `/api/v1/messages/${messageId}/report`,
    method: 'POST',
    body: { reason, details: details?.trim() || undefined },
  });
}

/** POST /users/{id}/block — idempotent. */
export async function blockUser(apiClient: ApiClient, userId: string): Promise<void> {
  await apiClient.request({ path: `/api/v1/users/${userId}/block`, method: 'POST' });
}
