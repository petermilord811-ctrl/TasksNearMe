import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressDocumentReader } from '@/integrations/ai/document-reader';
import { AiUnavailableError } from '@/integrations/ai';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { files } from '@/modules/tasks/schema';
import { readPendingDocuments } from '@/modules/verification/auto-check';
import { addressVerifications } from '@/modules/verification/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/** Proofs of address read once by the automatic reader (completion plan 4.1), on throwaway accounts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const READER = 'usr_tmp_reader_real';
const SEEDLIKE = 'usr_tmp_reader_test';
const PEOPLE = [READER, SEEDLIKE];
const stored = new Map<string, Buffer>();
const storage: FileStorage = {
  name: 'memory',
  put: async (key, body) => void stored.set(key, body),
  get: async (key) => stored.get(key) ?? null,
  delete: async (key) => void stored.delete(key),
};
const answers = { readable: true, nameMatches: true, addressMatches: false, recent: true, documentType: 'utility_bill' as const };
const stub = (read: AddressDocumentReader['read']): AddressDocumentReader => ({ name: 'stub', read: vi.fn(read) });
const address = JSON.stringify({ line1: '1100 Congress Ave', city: 'Austin', state: 'TX', zip: '78701' });

async function addProof(id: string, userId: string, submittedAt: Date, withFile = true) {
  const fileId = `fil_${id}`;
  await db.insert(files).values({ id: fileId, ownerUserId: userId, kind: 'address_proof', storageKey: `address-proofs/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 4 });
  if (withFile) stored.set(`address-proofs/${id}.webp`, Buffer.from('webp'));
  await db.insert(addressVerifications).values({ id, userId, status: 'in_review', addressCiphertext: cipher.encrypt(address), documentType: 'utility_bill', documentFileId: fileId, submittedAt, createdAt: submittedAt, updatedAt: submittedAt });
}
const checkOf = async (id: string) => (await db.select({ autoCheck: addressVerifications.autoCheck }).from(addressVerifications).where(eq(addressVerifications.id, id)))[0]?.autoCheck;

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    // Not a reserved domain, so the configured reader is used (nothing is sent anywhere in this test).
    { ...chris!, id: READER, email: 'tmp-reader@qa.tasksnearme-test.net', name: 'Rae R.', firstName: 'Rae', lastName: 'Reader', phone: '+15125550481' },
    { ...chris!, id: SEEDLIKE, email: 'tmp-reader@example.test', name: 'Sam R.', firstName: 'Sam', lastName: 'Reader', phone: '+15125550482' },
  ]);
  await addProof('adv_tmp_reader_1', READER, new Date('2026-11-12T15:00:00.000Z'));
  await addProof('adv_tmp_reader_2', SEEDLIKE, new Date('2026-11-12T16:00:00.000Z'));
});

afterAll(async () => {
  await db.delete(addressVerifications).where(inArray(addressVerifications.userId, PEOPLE));
  await db.delete(files).where(inArray(files.ownerUserId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('reading proofs of address', () => {
  const now = new Date('2026-11-13T15:00:00.000Z');
  const scope = { userIds: PEOPLE };

  it('reads each proof once and keeps only the answers; test accounts get the stand-in', async () => {
    const reader = stub(async () => answers);
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 2 });
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledWith({
      document: { bytes: Buffer.from('webp'), contentType: 'image/webp' },
      expected: { name: 'Rae Reader', address: '1100 Congress Ave, Austin, TX 78701', declaredType: 'utility_bill', submittedOn: '2026-11-12' },
    });
    expect(await checkOf('adv_tmp_reader_1')).toEqual({ ...answers, by: 'stub', at: now.toISOString() });
    expect(await checkOf('adv_tmp_reader_2')).toEqual({ readable: true, documentType: 'utility_bill', by: 'stand-in', at: now.toISOString() });
    // Read once.
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 0 });
  });

  it("leaves it to staff when the reader can't answer or the document is gone", async () => {
    await addProof('adv_tmp_reader_3', READER, new Date('2026-11-13T10:00:00.000Z'));
    await addProof('adv_tmp_reader_4', READER, new Date('2026-11-13T11:00:00.000Z'), false);
    const reader = stub(async () => { throw new AiUnavailableError('down'); });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 2 });
    quiet.mockRestore();
    expect(await checkOf('adv_tmp_reader_3')).toEqual({ readable: false, by: 'stub (unavailable)', at: now.toISOString() });
    expect(await checkOf('adv_tmp_reader_4')).toEqual({ readable: false, by: 'stub', at: now.toISOString() });
  });

  it('does nothing without a reader (production without a key)', async () => {
    await addProof('adv_tmp_reader_5', READER, new Date('2026-11-13T12:00:00.000Z'));
    expect(await readPendingDocuments(db, { storage, cipher, reader: null }, now, scope)).toEqual({ read: 0 });
    expect(await checkOf('adv_tmp_reader_5')).toBeNull();
  });
});
