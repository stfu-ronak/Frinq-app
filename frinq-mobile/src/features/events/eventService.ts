import { ApiClient } from '../../services/api/apiClient';
import { getEncryptedStore } from '../../storage/encryptedStorage';

const EVENTS_CACHE_KEY = 'published_events_cache_v1';

export interface FrinqEvent {
  id: string;
  image_url: string;
  name: string;
  quote: string;
  details: string;
  registration_url: string;
  starts_at: string;
  ends_at: string | null;
  sort_order: number;
  status: 'published';
}

export interface EventsResponse {
  events: FrinqEvent[];
  stale?: boolean;
}

function validCache(value: unknown): value is EventsResponse {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as EventsResponse).events)
    && (value as EventsResponse).events.length <= 100);
}

export async function fetchEvents(apiClient: ApiClient): Promise<EventsResponse> {
  try {
    const response = await apiClient.request<EventsResponse>({ path: '/api/v1/events' });
    if (validCache(response)) {
      try {
        const store = await getEncryptedStore();
        store.set(EVENTS_CACHE_KEY, JSON.stringify({ events: response.events.slice(0, 100) }));
      } catch {
        // Cache is an enhancement; never fail a successful network response.
      }
    }
    return response;
  } catch (error) {
    try {
      const store = await getEncryptedStore();
      const raw = store.getString(EVENTS_CACHE_KEY);
      const cached = raw ? JSON.parse(raw) as unknown : null;
      if (validCache(cached)) return { events: cached.events, stale: true };
    } catch {
      // Preserve the original network error when cache is absent/corrupt.
    }
    throw error;
  }
}
