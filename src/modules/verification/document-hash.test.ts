import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createKeyedHasher } from '@/platform/crypto/field-encryption';
import { ID_DOCUMENT_HASH_LABEL, identityDocumentHash, identityDocumentHasherFromEnv } from './document-hash';

const key = randomBytes(32).toString('base64');
const hasher = createKeyedHasher(key, ID_DOCUMENT_HASH_LABEL);
const reading = { documentNumber: '12345678', issuingState: 'TX', dateOfBirth: '1990-05-01' };

describe('the ID hash (plan 6.3)', () => {
  it('is the same for the same ID however it was printed or read, and never contains the number', () => {
    const hash = identityDocumentHash(reading, hasher);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('12345678');
    expect(identityDocumentHash({ documentNumber: ' 1234-5678 ', issuingState: 'tx', dateOfBirth: '1990-05-01' }, hasher)).toBe(hash);
    expect(identityDocumentHash({ documentNumber: 'd 123 456 78', issuingState: 'USA', dateOfBirth: '1990-05-01' }, hasher)).toBe(identityDocumentHash({ documentNumber: 'D12345678', issuingState: 'usa', dateOfBirth: '1990-05-01' }, hasher));
  });

  it('differs when any part differs, or under another key', () => {
    const hash = identityDocumentHash(reading, hasher);
    expect(identityDocumentHash({ ...reading, documentNumber: '12345679' }, hasher)).not.toBe(hash);
    expect(identityDocumentHash({ ...reading, issuingState: 'OK' }, hasher)).not.toBe(hash);
    expect(identityDocumentHash({ ...reading, dateOfBirth: '1990-05-02' }, hasher)).not.toBe(hash);
    expect(identityDocumentHash(reading, createKeyedHasher(randomBytes(32).toString('base64'), ID_DOCUMENT_HASH_LABEL))).not.toBe(hash);
  });

  it('is nothing for a reading that misses a part or misreads it', () => {
    expect(identityDocumentHash({ ...reading, documentNumber: undefined }, hasher)).toBeNull();
    expect(identityDocumentHash({ ...reading, documentNumber: '12-3' }, hasher)).toBeNull();
    expect(identityDocumentHash({ ...reading, issuingState: undefined }, hasher)).toBeNull();
    expect(identityDocumentHash({ ...reading, issuingState: 'Texas' }, hasher)).toBeNull();
    expect(identityDocumentHash({ ...reading, dateOfBirth: '1990-02-30' }, hasher)).toBeNull();
    expect(identityDocumentHash({ ...reading, dateOfBirth: '05/01/1990' }, hasher)).toBeNull();
  });

  it('uses its own key from the field key', () => {
    expect(identityDocumentHasherFromEnv({})).toBeNull();
    const fromEnv = identityDocumentHasherFromEnv({ FIELD_ENCRYPTION_KEY: key })!;
    expect(identityDocumentHash(reading, fromEnv)).toBe(identityDocumentHash(reading, hasher));
  });
});
