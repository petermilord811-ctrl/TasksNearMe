import { createKeyedHasher, type KeyedHasher } from '@/platform/crypto/field-encryption';
import { calendarDate } from './standing';

/** The label of the ID hash's own key (HKDF from FIELD_ENCRYPTION_KEY). Changing it changes every hash. */
export const ID_DOCUMENT_HASH_LABEL = 'tasksnearme.id-document-hash.v1';

/**
 * The same ID on two accounts (completion plan 6.3), without keeping the ID: a keyed hash of the document
 * number, the issuing state (or a passport's country) and the birth date, as read once from the front.
 * Each part is normalized, so the same card read twice gives the same hash ("D 123-456-78" and
 * "d12345678" are one number). Null when any part is missing or doesn't look like one, so a poor reading
 * never matches anything. The number is used here and nowhere else: never stored, logged or returned.
 */
export function identityDocumentHash(reading: { documentNumber?: string; issuingState?: string; dateOfBirth?: string }, hash: KeyedHasher): string | null {
  const number = (reading.documentNumber ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const state = (reading.issuingState ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z]/g, '');
  const born = calendarDate(reading.dateOfBirth);
  if (number.length < 4 || number.length > 30 || state.length < 2 || state.length > 3 || !born) return null;
  const birthDate = `${born.year}-${String(born.month).padStart(2, '0')}-${String(born.day).padStart(2, '0')}`;
  return hash(`${number}|${state}|${birthDate}`);
}

/** The app's ID hasher, from FIELD_ENCRYPTION_KEY (null without it: nothing is hashed). */
export function identityDocumentHasherFromEnv(env: Record<string, string | undefined> = process.env): KeyedHasher | null {
  const key = env.FIELD_ENCRYPTION_KEY;
  return key ? createKeyedHasher(key, ID_DOCUMENT_HASH_LABEL) : null;
}
