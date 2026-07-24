import { keychainCredentialStore, getOrCreateDraftEncryptionKey, clearDraftEncryptionKey } from '../secureCredentials';

describe('keychainCredentialStore', () => {
  afterEach(async () => {
    await keychainCredentialStore.clearRefreshToken();
  });

  it('returns null when nothing is stored', async () => {
    expect(await keychainCredentialStore.loadRefreshToken()).toBeNull();
  });

  it('saves and loads a refresh token', async () => {
    await keychainCredentialStore.saveRefreshToken('r-123');
    expect(await keychainCredentialStore.loadRefreshToken()).toBe('r-123');
  });

  it('overwrites on rotation', async () => {
    await keychainCredentialStore.saveRefreshToken('r-1');
    await keychainCredentialStore.saveRefreshToken('r-2');
    expect(await keychainCredentialStore.loadRefreshToken()).toBe('r-2');
  });

  it('clear removes the token', async () => {
    await keychainCredentialStore.saveRefreshToken('r-1');
    await keychainCredentialStore.clearRefreshToken();
    expect(await keychainCredentialStore.loadRefreshToken()).toBeNull();
  });
});

describe('draft encryption key', () => {
  afterEach(async () => {
    await clearDraftEncryptionKey();
  });

  it('generates a key once and reuses it on subsequent calls', async () => {
    const gen = jest.fn(() => 'deadbeef');
    const k1 = await getOrCreateDraftEncryptionKey(gen);
    const k2 = await getOrCreateDraftEncryptionKey(gen);
    expect(k1).toBe('deadbeef');
    expect(k2).toBe('deadbeef');
    expect(gen).toHaveBeenCalledTimes(1); // second call reused the stored key
  });

  it('a new key is generated after clearing', async () => {
    let n = 0;
    const gen = jest.fn(() => `key-${++n}`);
    const k1 = await getOrCreateDraftEncryptionKey(gen);
    await clearDraftEncryptionKey();
    const k2 = await getOrCreateDraftEncryptionKey(gen);
    expect(k1).toBe('key-1');
    expect(k2).toBe('key-2');
  });
});
