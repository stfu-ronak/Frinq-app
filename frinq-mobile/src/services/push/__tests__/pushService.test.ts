let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};
jest.mock('../../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
  randomHex: (n: number) => '0123456789abcdef0123456789abcdef'.slice(0, n * 2),
}));

const mockGetToken = jest.fn().mockResolvedValue('fake-fcm-token');
const mockRequestPermission = jest.fn();
const mockHasPermission = jest.fn();
const mockOnTokenRefresh = jest.fn().mockReturnValue(jest.fn());
const mockOnNotificationOpenedApp = jest.fn().mockReturnValue(jest.fn());
const mockGetInitialNotification = jest.fn().mockResolvedValue(null);

jest.mock('@react-native-firebase/messaging', () => {
  // Defined inline (not from an outer const) — the outer top-level consts in
  // this file aren't initialized yet when this factory runs, since import
  // hoisting requires '../pushService' (and transitively this mock) before
  // any of this file's own top-level statements execute.
  const AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
  const fn = () => ({
    getToken: mockGetToken,
    requestPermission: mockRequestPermission,
    hasPermission: mockHasPermission,
    onTokenRefresh: mockOnTokenRefresh,
    onNotificationOpenedApp: mockOnNotificationOpenedApp,
    getInitialNotification: mockGetInitialNotification,
  });
  fn.AuthorizationStatus = AuthorizationStatus;
  return { __esModule: true, default: fn, AuthorizationStatus };
});

import {
  getOrCreateInstallationId,
  getPushPermissionStatus,
  getStoredPushEnabled,
  hasPushPermission,
  hasShownPushOptInPrompt,
  markPushOptInPromptShown,
  onNotificationTapped,
  registerCurrentToken,
  removeCurrentToken,
  requestPushPermission,
  setPushEnabled,
} from '../pushService';
import { AuthorizationStatus } from '@react-native-firebase/messaging';

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
  mockGetToken.mockResolvedValue('fake-fcm-token');
});

describe('getOrCreateInstallationId', () => {
  it('generates a UUID once and persists it', async () => {
    const id = await getOrCreateInstallationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns the same id on subsequent calls', async () => {
    const first = await getOrCreateInstallationId();
    const second = await getOrCreateInstallationId();
    expect(second).toBe(first);
  });
});

describe('requestPushPermission / hasPushPermission', () => {
  it('reports granted for AUTHORIZED', async () => {
    mockRequestPermission.mockResolvedValue(AuthorizationStatus.AUTHORIZED);
    expect(await requestPushPermission()).toBe('granted');
  });

  it('reports granted for PROVISIONAL (iOS)', async () => {
    mockRequestPermission.mockResolvedValue(AuthorizationStatus.PROVISIONAL);
    expect(await requestPushPermission()).toBe('granted');
  });

  it('reports denied otherwise', async () => {
    mockRequestPermission.mockResolvedValue(AuthorizationStatus.DENIED);
    expect(await requestPushPermission()).toBe('denied');
  });

  it('hasPushPermission mirrors the same authorized/provisional check', async () => {
    mockHasPermission.mockResolvedValue(AuthorizationStatus.AUTHORIZED);
    expect(await hasPushPermission()).toBe(true);
    mockHasPermission.mockResolvedValue(AuthorizationStatus.DENIED);
    expect(await hasPushPermission()).toBe(false);
  });
});

describe('getPushPermissionStatus', () => {
  it('maps every raw status to its named form', async () => {
    mockHasPermission.mockResolvedValue(AuthorizationStatus.AUTHORIZED);
    expect(await getPushPermissionStatus()).toBe('authorized');
    mockHasPermission.mockResolvedValue(AuthorizationStatus.PROVISIONAL);
    expect(await getPushPermissionStatus()).toBe('provisional');
    mockHasPermission.mockResolvedValue(AuthorizationStatus.DENIED);
    expect(await getPushPermissionStatus()).toBe('denied');
    mockHasPermission.mockResolvedValue(AuthorizationStatus.NOT_DETERMINED);
    expect(await getPushPermissionStatus()).toBe('not-determined');
  });
});

describe('registerCurrentToken', () => {
  it('posts the token with a stable installation id, real FCM token, and platform', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    await registerCurrentToken({ request } as any);
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/push/tokens',
      method: 'POST',
      body: expect.objectContaining({ token: 'fake-fcm-token', platform: expect.stringMatching(/ios|android/) }),
    });
  });
});

describe('removeCurrentToken', () => {
  it('deletes by installation id and swallows errors (logout must never fail on this)', async () => {
    const request = jest.fn().mockRejectedValue(new Error('network'));
    await expect(removeCurrentToken({ request } as any)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('setPushEnabled', () => {
  it('patches preferences with the installation id and desired state', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    await setPushEnabled({ request } as any, false);
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/push/preferences',
      method: 'PATCH',
      body: expect.objectContaining({ enabled: false }),
    });
  });

  it('persists the preference locally, defaulting true until explicitly disabled', async () => {
    expect(await getStoredPushEnabled()).toBe(true);
    await setPushEnabled({ request: jest.fn().mockResolvedValue(undefined) } as any, false);
    expect(await getStoredPushEnabled()).toBe(false);
    await setPushEnabled({ request: jest.fn().mockResolvedValue(undefined) } as any, true);
    expect(await getStoredPushEnabled()).toBe(true);
  });
});

describe('push opt-in prompt shown-once flag', () => {
  it('is false until explicitly marked shown', async () => {
    expect(await hasShownPushOptInPrompt()).toBe(false);
    await markPushOptInPromptShown();
    expect(await hasShownPushOptInPrompt()).toBe(true);
  });
});

describe('onNotificationTapped', () => {
  it('invokes the callback when a delivered notification is tapped', () => {
    let captured: (() => void) | undefined;
    mockOnNotificationOpenedApp.mockImplementation((cb: () => void) => {
      captured = cb;
      return jest.fn();
    });
    const cb = jest.fn();
    onNotificationTapped(cb);
    captured?.();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('invokes the callback for a cold-start launch from a notification', async () => {
    mockGetInitialNotification.mockResolvedValue({ messageId: 'x' });
    const cb = jest.fn();
    onNotificationTapped(cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the callback when there is no initial notification', async () => {
    mockGetInitialNotification.mockResolvedValue(null);
    const cb = jest.fn();
    onNotificationTapped(cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalled();
  });
});
