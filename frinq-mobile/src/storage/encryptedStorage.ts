import 'react-native-get-random-values'; // polyfills global.crypto.getRandomValues (native CSPRNG)
import { createMMKV, type MMKV } from 'react-native-mmkv';
import { KeyValueStore } from './quizDraftRepository';
import { getOrCreateDraftEncryptionKey } from './secureCredentials';

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let instance: MMKV | null = null;

/**
 * Lazily creates the single AES-256-encrypted MMKV instance used for bounded
 * quiz drafts and non-secret preferences. The encryption key is a random
 * 256-bit value generated once via the native CSPRNG and stored in
 * Keychain/Keystore — never derived from anything guessable, never logged.
 * This instance NEVER stores tokens, voice bytes, chat, or AI results.
 */
export async function getEncryptedStore(): Promise<KeyValueStore> {
  if (instance) return instance;
  const key = await getOrCreateDraftEncryptionKey(() => randomHex(32));
  instance = createMMKV({ id: 'frinq-encrypted-store', encryptionKey: key });
  return instance;
}

/** Drop the cached instance so the next getEncryptedStore() rebuilds with a
 *  fresh key. Pair with clearDraftEncryptionKey() on logout/deletion so a
 *  removed account's store is cryptographically orphaned, not just emptied. */
export function resetEncryptedStore(): void {
  instance = null;
}

export { randomHex };
