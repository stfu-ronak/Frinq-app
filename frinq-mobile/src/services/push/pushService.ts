import { Platform } from 'react-native';
import messaging, { AuthorizationStatus, FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { ApiClient } from '../api/apiClient';
import { getEncryptedStore } from '../../storage/encryptedStorage';
import { uuidv4 } from '../util/uuid';
import { APP_VERSION } from '../api/config';

const INSTALLATION_ID_KEY = 'push_installation_id';

/** A non-secret, device-scoped identifier — generated once and persisted,
 *  never tied to a specific user (registerToken/ownership-transfer on the
 *  backend is exactly what lets the SAME installation move to a different
 *  user across logout/login on a shared device). Stored in the existing
 *  encrypted store purely for convenience (no separate plain-storage
 *  mechanism exists in this app) — the value itself carries no secret. */
export async function getOrCreateInstallationId(): Promise<string> {
  const store = await getEncryptedStore();
  const existing = store.getString(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const id = uuidv4();
  store.set(INSTALLATION_ID_KEY, id);
  return id;
}

export type PermissionOutcome = 'granted' | 'denied';

/** 'denied' means the OS was explicitly asked and refused — re-requesting
 *  won't show a system dialog again (iOS silently re-denies; Android 13+
 *  the same). The Settings screen uses this distinction to link out to the
 *  device's own notification settings instead of re-prompting pointlessly. */
export type PushPermissionStatus = 'authorized' | 'provisional' | 'denied' | 'not-determined';

function toPermissionStatus(status: number): PushPermissionStatus {
  if (status === AuthorizationStatus.AUTHORIZED) return 'authorized';
  if (status === AuthorizationStatus.PROVISIONAL) return 'provisional';
  if (status === AuthorizationStatus.DENIED) return 'denied';
  return 'not-determined';
}

/** Requests the OS notification permission. Must only be called after the
 *  user taps "Enable notifications" in the community opt-in prompt — never
 *  on app launch (Task 39's "ask only after community value" requirement).
 *
 *  On Android 13+ (API 33+) this runtime request needs
 *  `android.permission.POST_NOTIFICATIONS` declared in AndroidManifest.xml —
 *  added when Firebase was wired in (Task 39 resume), matching this exact
 *  pass so it never shipped untested. */
export async function requestPushPermission(): Promise<PermissionOutcome> {
  const status = toPermissionStatus(await messaging().requestPermission());
  return status === 'authorized' || status === 'provisional' ? 'granted' : 'denied';
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  return toPermissionStatus(await messaging().hasPermission());
}

export async function hasPushPermission(): Promise<boolean> {
  const status = await getPushPermissionStatus();
  return status === 'authorized' || status === 'provisional';
}

/** Registers (or refreshes) this installation's token with the backend.
 *  Call after permission is granted, and again on every token-refresh event. */
export async function registerCurrentToken(apiClient: ApiClient): Promise<void> {
  const token = await messaging().getToken();
  const installationId = await getOrCreateInstallationId();
  await apiClient.request({
    path: '/api/v1/push/tokens',
    method: 'POST',
    body: {
      installation_id: installationId,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      app_version: APP_VERSION,
    },
  });
}

/** Subscribes to FCM token-refresh events, re-registering automatically.
 *  Returns an unsubscribe function. Call once at app start if the user has
 *  already granted permission (checked via hasPushPermission()). */
export function onTokenRefresh(apiClient: ApiClient): () => void {
  return messaging().onTokenRefresh(() => {
    void registerCurrentToken(apiClient);
  });
}

/** Removes this installation's token — call on logout so a signed-out
 *  device stops receiving push for the account that just signed out. */
export async function removeCurrentToken(apiClient: ApiClient): Promise<void> {
  const installationId = await getOrCreateInstallationId();
  try {
    await apiClient.request({ path: `/api/v1/push/tokens/${installationId}`, method: 'DELETE' });
  } catch {
    // Best-effort — logout must never fail because push cleanup 404'd
    // (already removed) or hit a network error.
  }
}

const PUSH_ENABLED_KEY = 'push_enabled';
const PROMPT_SHOWN_KEY = 'push_opt_in_prompt_shown';

export async function setPushEnabled(apiClient: ApiClient, enabled: boolean): Promise<void> {
  const installationId = await getOrCreateInstallationId();
  await apiClient.request({
    path: '/api/v1/push/preferences',
    method: 'PATCH',
    body: { installation_id: installationId, enabled },
  });
  const store = await getEncryptedStore();
  store.set(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Local mirror of the last enabled/disabled preference sent to the backend —
 *  there's no GET for it server-side, so the Settings toggle's initial state
 *  comes from here. Defaults to true (matches the backend's default-enabled
 *  on registration) until the user explicitly turns it off. */
export async function getStoredPushEnabled(): Promise<boolean> {
  const store = await getEncryptedStore();
  return store.getString(PUSH_ENABLED_KEY) !== 'false';
}

/** Shown once, the first time a user reaches the community screen. */
export async function hasShownPushOptInPrompt(): Promise<boolean> {
  const store = await getEncryptedStore();
  return store.getString(PROMPT_SHOWN_KEY) === 'true';
}

export async function markPushOptInPromptShown(): Promise<void> {
  const store = await getEncryptedStore();
  store.set(PROMPT_SHOWN_KEY, 'true');
}

/** Deep-link routing: a tap on a delivered notification (foreground,
 *  background, or cold-start) always means "go to Community" — the backend
 *  never sends anything more specific (no message/community id in the
 *  payload, by design, per the generic-copy privacy requirement). The
 *  caller is responsible for waiting on boot/session/legal/membership
 *  resolution before actually navigating (this function only tells you a
 *  tap happened, never navigates itself). */
export function onNotificationTapped(cb: () => void): () => void {
  const unsubOpened = messaging().onNotificationOpenedApp(() => cb());
  messaging()
    .getInitialNotification()
    .then((remoteMessage: FirebaseMessagingTypes.RemoteMessage | null) => {
      if (remoteMessage) cb();
    })
    .catch(() => {
      // Best-effort cold-start tap detection — a rejection here must never
      // surface as an unhandled promise rejection.
    });
  return () => unsubOpened();
}
