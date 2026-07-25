import { blockUser, reportMessage } from '../communityService';

describe('reportMessage', () => {
  it('posts the reason and trimmed details', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    await reportMessage({ request } as any, 42, 'spam', '  extra info  ');
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/messages/42/report',
      method: 'POST',
      body: { reason: 'spam', details: 'extra info' },
    });
  });

  it('omits details entirely when blank', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    await reportMessage({ request } as any, 42, 'other', '   ');
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/messages/42/report',
      method: 'POST',
      body: { reason: 'other', details: undefined },
    });
  });
});

describe('blockUser', () => {
  it('posts to the block endpoint', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    await blockUser({ request } as any, 'user-123');
    expect(request).toHaveBeenCalledWith({ path: '/api/v1/users/user-123/block', method: 'POST' });
  });
});
