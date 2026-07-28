import { fetchQuizConfig } from '../quizConfigService';

describe('fetchQuizConfig', () => {
  it('returns the parsed version/steps on success', async () => {
    const apiClient = { request: jest.fn().mockResolvedValue({ version: 3, steps: [{ id: 'x', kind: 'text' }] }) };

    const result = await fetchQuizConfig(apiClient as any);

    expect(result.version).toBe(3);
    expect(apiClient.request).toHaveBeenCalledWith({ path: '/api/v1/quiz/config' });
  });

  it('propagates a failure for the caller to handle', async () => {
    const apiClient = { request: jest.fn().mockRejectedValue(new Error('network')) };

    await expect(fetchQuizConfig(apiClient as any)).rejects.toThrow('network');
  });
});
