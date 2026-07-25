import { ApiClient } from '../../services/api/apiClient';
import { CommunityMe } from '../../services/api/contracts';

export type { CommunityMe };

export async function fetchCommunityMe(apiClient: ApiClient): Promise<CommunityMe> {
  return apiClient.request<CommunityMe>({ path: '/api/v1/community/me' });
}

export async function updateCommunityMute(apiClient: ApiClient, muted: boolean): Promise<{ muted: boolean }> {
  return apiClient.request<{ muted: boolean }>({
    path: '/api/v1/community/preferences',
    method: 'PATCH',
    body: { muted },
  });
}
