import { fetchEvents } from '../eventService';

const mockCachedStore = { getString: jest.fn(), set: jest.fn(), remove: jest.fn() };
jest.mock('../../../storage/encryptedStorage', () => ({
  getEncryptedStore: jest.fn(async () => mockCachedStore),
}));

it('fetches published event timeline through API client', async () => {
  const request = jest.fn().mockResolvedValue({ events: [{ id: 'event-1', name: 'Frinq night' }] });
  const result = await fetchEvents({ request } as never);
  expect(request).toHaveBeenCalledWith({ path: '/api/v1/events' });
  expect(result.events[0].id).toBe('event-1');
});

it('returns bounded encrypted cache when the event request is offline', async () => {
  mockCachedStore.getString.mockReturnValue(JSON.stringify({ events: [{ id: 'cached-1', name: 'Saved event' }] }));
  const request = jest.fn().mockRejectedValue(new Error('offline'));

  const result = await fetchEvents({ request } as never);

  expect(result.stale).toBe(true);
  expect(result.events[0].id).toBe('cached-1');
});
