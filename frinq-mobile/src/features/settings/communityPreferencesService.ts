import { ApiClient } from '../../services/api/apiClient';

export interface CommunityMe {
  archetype_slug: string;
  name: string;
  description: string;
  muted: boolean;
}

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
