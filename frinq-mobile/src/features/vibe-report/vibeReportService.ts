import { ApiClient } from '../../services/api/apiClient';
import { VibeReport } from '../../services/api/contracts';

/** GET /api/v1/quiz/summary/{id}. Same endpoint ProcessingScreen polls
 *  before onboarding_state flips to active — this is the same data, fetched
 *  fresh whenever the report is viewed (e.g. from Profile, any time later). */
export async function loadVibeReport(apiClient: ApiClient, submissionId: string): Promise<VibeReport> {
  return apiClient.request<VibeReport>({ path: `/api/v1/quiz/summary/${submissionId}` });
}
