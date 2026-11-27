import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressDocumentReader, AddressDocumentReading } from '@/integrations/ai/document-reader';
import { AiUnavailableError } from '@/integrations/ai';
import type { FileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { featureFlags } from '@/modules/markets/schema';
import { files } from '@/modules/tasks/schema';
import { readPendingDocuments } from '@/modules/verification/auto-check';
import { addressVerifications } from '@/modules/verification/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Proofs of address read once by the automatic reader (completion plan 4.1), on throwaway accounts, and since
 * 2026-11-27 decided by its checks where `auto_verification_address` is on (owner: "For home address check, no need to
 * double check on my end. Just request another verification, if fraud. if that is also failed, request human review"):
 * a clean, confident reading is verified by the system; a miss is turned down so the person sends another, and a second
 * miss waits for staff. A reader that couldn't read it leaves it to staff. Documents are kept.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const READER = 'usr_tmp_reader_real';
const SEEDLIKE = 'usr_tmp_reader_test';
const RETRY = 'usr_tmp_reader_retry';
const PEOPLE = [READER, SEEDLIKE, RETRY];
const stored = new Map<string, Buffer>();
const storage: FileStorage = {
  name: 'memory',
  put: async (key, body) => void stored.set(key, body),
  get: async (key) => stored.get(key) ?? null,
  delete: async (key) => void stored.delete(key),
};
const answers = { readable: true, nameMatches: true, addressMatches: false, recent: true, documentType: 'utility_bill' as const };
/** What the server's reader says about a clean PDF statement with every answer yes. */
const clean: AddressDocumentReading = {
  readable: true,
  documentType: 'utility_bill',
  nameMatches: true,
  addressMatches: true,
  recent: true,
  issuer: { name: 'Austin Energy', kind: 'utility_bill' },
  documentDate: '2026-11-01',
  textSource: 'pdf',
  confident: true,
  unedited: 'pass',
  signals: ['issuer_known', 'name_near_address', 'address_in_header'],
};
const stub = (read: AddressDocumentReader['read']): AddressDocumentReader => ({ name: 'stub', read: vi.fn(read) });
const address = JSON.stringify({ line1: '1100 Congress Ave', city: 'Austin', state: 'TX', zip: '78701' });
const checksOf = (outcomes: Record<string, string>) => ['readable', 'accepted_kind', 'name', 'address', 'recent', 'unedited'].map((key) => ({ key, outcome: outcomes[key] ?? 'unsure' }));

async function addProof(id: string, userId: string, submittedAt: Date, withFile = true) {
  const fileId = `fil_${id}`;
  await db.insert(files).values({ id: fileId, ownerUserId: userId, kind: 'address_proof', storageKey: `address-proofs/${id}.webp`, contentType: 'image/webp', width: 10, height: 10, bytes: 4 });
  if (withFile) stored.set(`address-proofs/${id}.webp`, Buffer.from('webp'));
  await db.insert(addressVerifications).values({ id, userId, status: 'in_review', addressCiphertext: cipher.encrypt(address), documentType: 'utility_bill', documentFileId: fileId, submittedAt, createdAt: submittedAt, updatedAt: submittedAt });
}
const checkOf = async (id: string) => (await db.select({ autoCheck: addressVerifications.autoCheck }).from(addressVerifications).where(eq(addressVerifications.id, id)))[0]?.autoCheck;
const proofOf = async (id: string) => (await db.select().from(addressVerifications).where(eq(addressVerifications.id, id)))[0]!;

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    // Not a reserved domain, so the configured reader is used (nothing is sent anywhere in this test).
    { ...chris!, id: READER, email: 'tmp-reader@qa.tasksnearme-test.net', name: 'Rae R.', firstName: 'Rae', lastName: 'Reader', phone: '+15125550481' },
    { ...chris!, id: SEEDLIKE, email: 'tmp-reader@example.test', name: 'Sam R.', firstName: 'Sam', lastName: 'Reader', phone: '+15125550482' },
    { ...chris!, id: RETRY, email: 'tmp-reader-retry@qa.tasksnearme-test.net', name: 'Rio R.', firstName: 'Rio', lastName: 'Retry', phone: '+15125550483' },
  ]);
  await addProof('adv_tmp_reader_1', READER, new Date('2026-11-12T15:00:00.000Z'));
  await addProof('adv_tmp_reader_2', SEEDLIKE, new Date('2026-11-12T16:00:00.000Z'));
});

afterAll(async () => {
  await db.delete(auditLog).where(inArray(auditLog.targetId, PEOPLE));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await db.delete(addressVerifications).where(inArray(addressVerifications.userId, PEOPLE));
  await db.delete(files).where(inArray(files.ownerUserId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('reading proofs of address', () => {
  const now = new Date('2026-11-13T15:00:00.000Z');
  const scope = { userIds: PEOPLE };

  it('reads each proof once and keeps the answers with their checks; test accounts get the stand-in', async () => {
    const reader = stub(async () => answers);
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 2 });
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read).toHaveBeenCalledWith({
      document: { bytes: Buffer.from('webp'), contentType: 'image/webp' },
      expected: { name: 'Rae Reader', address: '1100 Congress Ave, Austin, TX 78701', declaredType: 'utility_bill', submittedOn: '2026-11-12' },
    });
    // The address differs: a first miss, turned down so the person sends another.
    expect(await checkOf('adv_tmp_reader_1')).toEqual({
      ...answers,
      checks: checksOf({ readable: 'pass', accepted_kind: 'pass', name: 'pass', address: 'fail', recent: 'pass' }),
      signals: [],
      decision: 'rejected',
      by: 'stub',
      at: now.toISOString(),
    });
    expect(await checkOf('adv_tmp_reader_2')).toEqual({
      readable: true,
      documentType: 'utility_bill',
      checks: checksOf({ readable: 'pass', accepted_kind: 'pass' }),
      signals: [],
      decision: 'review',
      by: 'stand-in',
      at: now.toISOString(),
    });
    expect(await proofOf('adv_tmp_reader_1')).toMatchObject({ status: 'rejected', rejectionReason: 'address_mismatch', decidedBy: 'auto' });
    // The test account's stays with staff.
    expect((await proofOf('adv_tmp_reader_2')).status).toBe('in_review');
    // Read once.
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 0 });
  });

  it("leaves it to staff when the reader can't answer or the document is gone", async () => {
    await addProof('adv_tmp_reader_3', READER, new Date('2026-11-13T10:00:00.000Z'));
    await addProof('adv_tmp_reader_4', READER, new Date('2026-11-13T11:00:00.000Z'), false);
    const reader = stub(async () => {
      throw new AiUnavailableError('down');
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readPendingDocuments(db, { storage, cipher, reader }, now, scope)).toEqual({ read: 2 });
    quiet.mockRestore();
    const unread = { readable: false, checks: checksOf({ readable: 'fail' }), signals: [], decision: 'review', at: now.toISOString() };
    expect(await checkOf('adv_tmp_reader_3')).toEqual({ ...unread, by: 'stub (unavailable)' });
    expect(await checkOf('adv_tmp_reader_4')).toEqual({ ...unread, by: 'stub' });
  });

  it('does nothing without a reader (production without a key)', async () => {
    await addProof('adv_tmp_reader_5', READER, new Date('2026-11-13T12:00:00.000Z'));
    expect(await readPendingDocuments(db, { storage, cipher, reader: null }, now, scope)).toEqual({ read: 0 });
    expect(await checkOf('adv_tmp_reader_5')).toBeNull();
  });
});

describe('automatic decisions on proofs of address', () => {
  const now = new Date('2026-11-13T16:00:00.000Z');
  /** Reads everything still waiting for READER (earlier tests' proofs too, with the same stub). */
  const drain = async (reader: AddressDocumentReader) => {
    while ((await readPendingDocuments(db, { storage, cipher, reader }, now, { userIds: [READER] })).read > 0);
  };

  it('verifies a clean, confident reading as the system: decided by auto, logged and told', async () => {
    await addProof('adv_tmp_auto_ok', READER, new Date('2026-11-13T13:00:00.000Z'));
    await drain(stub(async () => clean));
    const proof = await proofOf('adv_tmp_auto_ok');
    expect(proof).toMatchObject({ status: 'verified', decidedBy: 'auto', decidedByUserId: null, rejectionReason: null });
    expect(proof.decidedAt?.toISOString()).toBe(now.toISOString());
    expect(proof.autoCheck).toMatchObject({ decision: 'approved', issuer: 'Austin Energy', documentDate: '2026-11-01', signals: clean.signals });
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.targetId, READER), eq(auditLog.action, 'address.verified')));
    expect(entries).toContainEqual(expect.objectContaining({ actorRole: 'system', actorId: null, metadata: { verificationId: 'adv_tmp_auto_ok', decidedBy: 'auto' } }));
    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, READER), eq(outboxEvents.type, 'verification.updated')));
    expect(events.map((event) => event.payload)).toContainEqual({ userId: READER, track: 'address', outcome: 'passed' });
  });

  it('turns down a document dated more than 90 days before it was sent', async () => {
    await addProof('adv_tmp_auto_old', READER, new Date('2026-11-13T14:00:00.000Z'));
    await drain(stub(async () => ({ ...clean, recent: false, documentDate: '2026-06-01' })));
    expect(await proofOf('adv_tmp_auto_old')).toMatchObject({ status: 'rejected', rejectionReason: 'too_old', decidedBy: 'auto', decidedByUserId: null });
    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, READER), eq(outboxEvents.type, 'verification.updated')));
    expect(events.map((event) => event.payload)).toContainEqual({ userId: READER, track: 'address', outcome: 'action_needed' });
  });

  it('waits for staff when automatic decisions are off for the market, keeping what the checks said', async () => {
    const [person] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, READER));
    await db
      .insert(featureFlags)
      .values({ key: 'auto_verification_address', marketId: person!.marketId, enabled: false, description: 'test' })
      .onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: false } });
    try {
      await addProof('adv_tmp_auto_off', READER, new Date('2026-11-13T15:00:00.000Z'));
      await drain(stub(async () => clean));
      const proof = await proofOf('adv_tmp_auto_off');
      expect(proof).toMatchObject({ status: 'in_review', decidedBy: null });
      expect(proof.autoCheck).toMatchObject({ decision: 'approved' });
    } finally {
      await db.delete(featureFlags).where(and(eq(featureFlags.key, 'auto_verification_address'), eq(featureFlags.marketId, person!.marketId)));
    }
  });

  it('turns the first miss down, sends the second to staff, and starts over after a staff decision; documents stay', async () => {
    const edited = stub(async () => ({ ...clean, unedited: 'fail' as const, signals: ['pdf_text_overlay' as const] }));
    const once = (id: string, minute: number) => addProof(id, RETRY, new Date(`2026-11-13T15:${String(minute).padStart(2, '0')}:00.000Z`));
    const readRetry = () => readPendingDocuments(db, { storage, cipher, reader: edited }, now, { userIds: [RETRY] });

    await once('adv_tmp_retry_1', 10);
    await readRetry();
    expect(await proofOf('adv_tmp_retry_1')).toMatchObject({ status: 'rejected', rejectionReason: 'suspicious', decidedBy: 'auto' });

    await once('adv_tmp_retry_2', 20);
    await readRetry();
    const second = await proofOf('adv_tmp_retry_2');
    expect(second).toMatchObject({ status: 'in_review', decidedBy: null });
    expect(second.autoCheck).toMatchObject({ decision: 'review' });

    // Staff turn the second down themselves: the next miss is a first one again.
    await db.update(addressVerifications).set({ status: 'rejected', decidedBy: 'staff', rejectionReason: 'suspicious', decidedAt: now }).where(eq(addressVerifications.id, 'adv_tmp_retry_2'));
    await once('adv_tmp_retry_3', 30);
    await readRetry();
    expect(await proofOf('adv_tmp_retry_3')).toMatchObject({ status: 'rejected', decidedBy: 'auto' });

    // "Save document always": every document is still stored.
    const proofs = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, RETRY));
    expect(proofs).toHaveLength(3);
    expect(proofs.every((proof) => proof.documentFileId !== null && proof.documentDeletedAt === null)).toBe(true);
  });

  it('never decides for a test account, whatever its reading', async () => {
    await addProof('adv_tmp_auto_test', SEEDLIKE, new Date('2026-11-13T15:30:00.000Z'));
    await readPendingDocuments(db, { storage, cipher, reader: stub(async () => clean) }, now, { userIds: [SEEDLIKE] });
    expect(await proofOf('adv_tmp_auto_test')).toMatchObject({ status: 'in_review', decidedBy: null });
  });
});
