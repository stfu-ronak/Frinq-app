import { resetForTesting } from '../resetForTestingService';

const mockClearLocalSessionState = jest.fn().mockResolvedValue(undefined);
jest.mock('../localSessionCleanup', () => ({
  clearLocalSessionState: (...args: unknown[]) => mockClearLocalSessionState(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resetForTesting', () => {
  it('clears local state and reports success when the server accepts the reset', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    const apiClient = { request } as any;
    const coordinator = {} as any;
    const queryClient = {} as any;

    const ok = await resetForTesting(apiClient, coordinator, queryClient);

    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/users/me/reset-for-testing', method: 'POST' });
    expect(mockClearLocalSessionState).toHaveBeenCalledWith(coordinator, queryClient);
  });

  it('leaves local state untouched and reports failure when the server refuses (e.g. not a test phone)', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('404')) } as any;

    const ok = await resetForTesting(apiClient, {} as any, {} as any);

    expect(ok).toBe(false);
    expect(mockClearLocalSessionState).not.toHaveBeenCalled();
  });
});
