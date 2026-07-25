import { randomHex } from '../../storage/encryptedStorage';

/** UUID v4 from the same native CSPRNG already used for the draft-store key
 *  (react-native-get-random-values, imported once in encryptedStorage.ts) —
 *  no new dependency for something 16 random bytes + two bit-twiddles cover. */
export function uuidv4(): string {
  const bytes = randomHex(16).match(/../g) as string[];
  bytes[6] = ((parseInt(bytes[6], 16) & 0x0f) | 0x40).toString(16).padStart(2, '0');
  bytes[8] = ((parseInt(bytes[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
