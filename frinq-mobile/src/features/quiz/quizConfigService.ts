import { ApiClient } from '../../services/api/apiClient';
import { QuizStep } from './domain/quizDefinition';

export interface QuizConfigResponse {
  version: number;
  steps: QuizStep[];
}

export async function fetchQuizConfig(apiClient: ApiClient): Promise<QuizConfigResponse> {
  return apiClient.request<QuizConfigResponse>({ path: '/api/v1/quiz/config' });
}
