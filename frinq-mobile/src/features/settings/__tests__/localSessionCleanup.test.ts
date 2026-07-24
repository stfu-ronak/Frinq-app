import { clearLocalSessionState } from '../localSessionCleanup';

let mockStoreData: Map<string, string>;
const mockStore = {
  getString: (k: string) => mockStoreData.get(k) ?? null,
  set: (k: string, v: string) => void mockStoreData.set(k, v),
  remove: (k: string) => void mockStoreData.delete(k),
};

const mockResetEncryptedStore = jest.fn();
jest.mock('../../../storage/encryptedStorage', () => ({
  getEncryptedStore: async () => mockStore,
  resetEncryptedStore: () => mockResetEncryptedStore(),
}));

const mockClearDraftEncryptionKey = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../storage/secureCredentials', () => ({
  clearDraftEncryptionKey: () => mockClearDraftEncryptionKey(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreData = new Map();
});

describe('clearLocalSessionState', () => {
  it('clears the refresh token, query cache, every encrypted-store key, and shreds the key', async () => {
    // Seed all three encrypted-store keys, incl. the PII-bearing pending name.
    mockStoreData.set('quiz_draft', JSON.stringify({ submissionId: 's1' }));
    mockStoreData.set('pending_quiz_state', JSON.stringify({ name: 'Ada Lovelace' }));
    mockStoreData.set('pending_legal_acceptance', JSON.stringify({ termsVersion: 'draft-1' }));

    const coordinator = { clear: jest.fn().mockResolvedValue(undefined) } as any;
    const queryClient = { clear: jest.fn() } as any;

    await clearLocalSessionState(coordinator, queryClient);

    expect(coordinator.clear).toHaveBeenCalledTimes(1);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    // No residual local state — especially no leftover typed name (PII).
    expect(mockStoreData.get('quiz_draft')).toBeUndefined();
    expect(mockStoreData.get('pending_quiz_state')).toBeUndefined();
    expect(mockStoreData.get('pending_legal_acceptance')).toBeUndefined();
    // Key shredded + cached instance dropped.
    expect(mockClearDraftEncryptionKey).toHaveBeenCalledTimes(1);
    expect(mockResetEncryptedStore).toHaveBeenCalledTimes(1);
  });
});
