import { getEncryptedStore } from '../../storage/encryptedStorage';

const KEY = 'pending_legal_acceptance';

export interface PendingLegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  locale: string;
}

/**
 * Set on the Legal Acceptance screen BEFORE an account exists, POSTed to
 * /api/v1/legal/accept immediately after OTP creates the account, cleared only
 * on server acknowledgement. Held in the same encrypted bounded store as quiz
 * drafts — never tokens, never anything else.
 */
export async function savePendingAcceptance(value: PendingLegalAcceptance): Promise<void> {
  const store = await getEncryptedStore();
  store.set(KEY, JSON.stringify(value));
}

export async function loadPendingAcceptance(): Promise<PendingLegalAcceptance | null> {
  const store = await getEncryptedStore();
  const raw = store.getString(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingLegalAcceptance;
  } catch {
    return null;
  }
}

export async function clearPendingAcceptance(): Promise<void> {
  const store = await getEncryptedStore();
  store.remove(KEY);
}
