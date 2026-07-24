import { getEncryptedStore, randomHex } from '../encryptedStorage';
import { clearDraftEncryptionKey } from '../secureCredentials';

describe('randomHex', () => {
  it('produces the requested byte length as hex and varies per call', () => {
    const a = randomHex(32);
    const b = randomHex(32);
    expect(a).toHaveLength(64); // 32 bytes -> 64 hex chars
    expect(a).not.toBe(b);
  });
});

describe('getEncryptedStore', () => {
  afterEach(async () => {
    await clearDraftEncryptionKey();
  });

  it('returns a store that supports get/set/delete', async () => {
    const store = await getEncryptedStore();
    store.set('k', 'v');
    expect(store.getString('k')).toBe('v');
    store.remove('k');
    expect(store.getString('k')).toBeUndefined();
  });

  it('reuses the same MMKV instance across calls (single instance)', async () => {
    const store1 = await getEncryptedStore();
    const store2 = await getEncryptedStore();
    expect(store1).toBe(store2);
  });
});
