import * as Keychain from 'react-native-keychain';
import { SecureCredentialStore } from '../services/session/SessionCoordinator';

const REFRESH_TOKEN_SERVICE = 'in.frinq.app.refreshToken';
const DRAFT_KEY_SERVICE = 'in.frinq.app.draftEncryptionKey';

/** Keychain/Keystore-backed refresh-token store. Access tokens NEVER pass
 *  through here — they live only in SessionCoordinator's process memory. */
export const keychainCredentialStore: SecureCredentialStore = {
  async saveRefreshToken(token: string): Promise<void> {
    await Keychain.setGenericPassword('refresh_token', token, { service: REFRESH_TOKEN_SERVICE });
  },
  async loadRefreshToken(): Promise<string | null> {
    const result = await Keychain.getGenericPassword({ service: REFRESH_TOKEN_SERVICE });
    return result ? result.password : null;
  },
  async clearRefreshToken(): Promise<void> {
    await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_SERVICE });
  },
};

/** A random 256-bit key for the MMKV quiz-draft store, itself stored in
 *  Keychain/Keystore. Generated once on first use, stable across app
 *  restarts, wiped only by clearDraftEncryptionKey (account deletion etc). */
export async function getOrCreateDraftEncryptionKey(randomHex: () => string): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: DRAFT_KEY_SERVICE });
  if (existing) return existing.password;
  const key = randomHex();
  await Keychain.setGenericPassword('draft_key', key, { service: DRAFT_KEY_SERVICE });
  return key;
}

export async function clearDraftEncryptionKey(): Promise<void> {
  await Keychain.resetGenericPassword({ service: DRAFT_KEY_SERVICE });
}
