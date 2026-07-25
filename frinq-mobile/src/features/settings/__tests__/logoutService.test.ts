import { performLogout } from '../logoutService';

const mockRemoveCurrentToken = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/push/pushService', () => ({
  removeCurrentToken: (...args: unknown[]) => mockRemoveCurrentToken(...args),
}));

const mockClearLocalSessionState = jest.fn().mockResolvedValue(undefined);
jest.mock('../localSessionCleanup', () => ({
  clearLocalSessionState: (...args: unknown[]) => mockClearLocalSessionState(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('performLogout', () => {
  it('removes the push token before logging out server-side and clearing local state', async () => {
    const calls: string[] = [];
    mockRemoveCurrentToken.mockImplementation(async () => { calls.push('removeToken'); });
    const request = jest.fn().mockImplementation(async () => { calls.push('logout'); });
    mockClearLocalSessionState.mockImplementation(async () => { calls.push('clearLocal'); });

    const apiClient = { request } as any;
    const coordinator = {} as any;
    const queryClient = {} as any;

    await performLogout(apiClient, coordinator, queryClient);

    expect(calls).toEqual(['removeToken', 'logout', 'clearLocal']);
    expect(mockRemoveCurrentToken).toHaveBeenCalledWith(apiClient);
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/auth/logout', method: 'POST' });
    expect(mockClearLocalSessionState).toHaveBeenCalledWith(coordinator, queryClient);
  });

  it('still clears local state when the server logout call fails', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) } as any;
    await expect(performLogout(apiClient, {} as any, {} as any)).resolves.toBeUndefined();
    expect(mockClearLocalSessionState).toHaveBeenCalledTimes(1);
  });
});
