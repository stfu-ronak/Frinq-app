import { QueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../services/api/apiClient';
import { SessionCoordinator } from '../../services/session/SessionCoordinator';
import { removeCurrentToken } from '../../services/push/pushService';
import { clearLocalSessionState } from './localSessionCleanup';

/** Never throws: the user asked to log out, so a failed server call must
 *  not strand them signed in locally. Push token removal happens first,
 *  while the session is still authenticated — the account itself isn't
 *  going away, so its push_tokens row won't cascade away on its own. */
export async function performLogout(apiClient: ApiClient, coordinator: SessionCoordinator, queryClient: QueryClient): Promise<void> {
  await removeCurrentToken(apiClient);
  await apiClient.request({ path: '/api/v1/auth/logout', method: 'POST' }).catch(() => {});
  await clearLocalSessionState(coordinator, queryClient);
}
