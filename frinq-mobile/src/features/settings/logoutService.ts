import { QueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../services/api/apiClient';
import { SessionCoordinator } from '../../services/session/SessionCoordinator';
import { clearLocalSessionState } from './localSessionCleanup';

/** Never throws: the user asked to log out, so a failed server call must
 *  not strand them signed in locally. */
export async function performLogout(apiClient: ApiClient, coordinator: SessionCoordinator, queryClient: QueryClient): Promise<void> {
  await apiClient.request({ path: '/api/v1/auth/logout', method: 'POST' }).catch(() => {});
  await clearLocalSessionState(coordinator, queryClient);
}
