import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiUnavailableError } from '@/integrations/ai';
import type { IdDocumentReader, IdDocumentReading } from '@/integrations/ai/id-document-reader';
import type { IdBarcodeDetails } from '@/integrations/ocr';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { readPendingIds } from '@/modules/verification/auto-check';
import { acceptIdentityNotice, submitIdentityCapture } from '@/modules/verification/capture';
import { addressVerifications, identityCaptures } from '@/modules/verification/schema';
import type { StaffActor } from '@/modules/support/staff';
import { revealIdentityDetails } from '@/modules/verification/staff';
import { auditLog } from '@/platform/audit/schema';
import { createByteCipher, createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The ID's details from the barcode on its back (owner, 2026-11-21): the reading job compares the barcode with the
 * account and the home address on file, keeps only the answers and tells the deciding staff; staff see the details on
 * demand, before the photos, with a logged reason, and nothing they saw is stored.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const root = path.join(os.tmpdir(), `tnm-identity-details-${process.pid}`);
const storage = createLocalFileStorage(root);
const fileCipher = createByteCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const deps = { db, storage, files: fileCipher, secret: 'test-secret-for-document-links-0123456789' };
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const alex = { id: 'usr_alex', roles: ['support_agent' as const] };
const REAL = 'usr_idd_real';
const TEST = 'usr_idd_test';
const PASSPORT = 'usr_idd_passport';
const STAFFER = 'usr_idd_staffer';
const PEOPLE = [REAL, TEST, PASSPORT, STAFFER];
const now = new Date('2026-11-21T16:00:00.000Z');
const home = { line1: '4401 SW 34th Street', line2: 'Apt 12', city: 'Gainesville', state: 'FL', zip: '32608' };

const license: IdBarcodeDetails = {
  documentType: 'drivers_license',
  issuingState: 'FL',
  givenNames: 'Vera',
  middleNames: 'Ann',
  surname: 'Tester',
  dateOfBirth: '1990-05-01',
  expiryDate: '2030-05-01',
  issueDate: '2022-05-01',
  documentNumber: 'T123-456-90-001-0',
  address: { line1: '4401 SW 34th St', line2: 'Apt 12', city: 'Gainesville', state: 'FL', zip: '326081234' },
  sex: 'female',
};

/** A helper up to the ID step (the basics, the agreement, a verified phone), with the Texas notice accepted. */
async function person(id: string, email: string) {
  const since = new Date('2026-10-01T00:00:00Z');
  await db.insert(users).values({ id, email, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+15125559${PEOPLE.indexOf(id)}77`, phoneVerifiedAt: since, createdAt: since });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [yard] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: yard!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, since);
  await acceptIdentityNotice(db, id, { consent: true }, now);
}

async function photo(name: string) {
  const body = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#d9c7b2' } }).jpeg().toBuffer();
  return new File([new Uint8Array(body)], name, { type: 'image/jpeg' });
}

async function capture(userId: string, documentType: 'drivers_license' | 'passport') {
  const form = new FormData();
  form.set('documentType', documentType);
  for (const kind of documentType === 'passport' ? ['front', 'selfie'] : ['front', 'back', 'selfie']) form.set(kind, await photo(`${kind}.jpg`));
  expect(await submitIdentityCapture(deps, userId, form, now)).toEqual({ ok: true, code: 'submitted' });
  const [row] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId));
  return row!;
}

async function homeAddress(userId: string) {
  await db.insert(addressVerifications).values({ id: `adv_${userId}`, userId, status: 'verified', addressCiphertext: cipher.encrypt(JSON.stringify(home)), submittedAt: now, decidedAt: now });
}

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await person(REAL, 'idd-real@qa.tasksnearme-test.net');
  await person(TEST, 'idd-test@example.test');
  await person(PASSPORT, 'idd-passport@qa.tasksnearme-test.net');
  await person(STAFFER, 'idd-staffer@qa.tasksnearme-test.net');
  await homeAddress(REAL);
  await homeAddress(TEST);
});

afterAll(async () => {
  await db.delete(auditLog).where(inArray(auditLog.targetId, PEOPLE));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('the reading job with the barcode', () => {
  it('hands the reader the back, keeps only answers (the address against the home address on file) and tells staff once', async () => {
    const real = await capture(REAL, 'drivers_license');
    await capture(TEST, 'drivers_license');
    const reading: IdDocumentReading = { readable: true, givenNames: 'Vera', surname: 'Tester', dateOfBirth: '1990-05-01', expiryDate: '2030-05-01', documentType: 'drivers_license', issuingState: 'FL', documentNumber: 'T123', source: 'barcode', address: license.address!, frontAgrees: false };
    const reader: IdDocumentReader = { name: 'stub', read: vi.fn(async () => reading) };
    const notify = vi.fn(async () => undefined);
    expect(await readPendingIds(db, { storage, files: fileCipher, reader, hasher: null, addressCipher: cipher, notify }, now, { userIds: [REAL, TEST] })).toBe(2);
    expect(reader.read).toHaveBeenCalledTimes(1);
    const input = vi.mocked(reader.read).mock.calls[0]![0];
    expect(input.back?.contentType).toBe('image/webp');
    expect(input.back?.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    const [saved] = await db.select().from(identityCaptures).where(eq(identityCaptures.id, real.id));
    expect(saved!.autoCheck).toMatchObject({
      readable: true, nameMatches: true, isAdult: true, notExpired: true, expiresMonth: 5, expiresYear: 2030, documentType: 'drivers_license',
      addressMatches: true, source: 'barcode', frontAgrees: false, by: 'stub', at: now.toISOString(),
    });
    // The front disagrees with the barcode: the checks leave it to staff, who are told.
    expect(saved!.autoCheck!.decision).toBe('review');
    expect(JSON.stringify(saved!.autoCheck)).not.toMatch(/4401|Gainesville|T123|1990/);
    // The test account (example.test) got the stand-in and no email.
    // With the ID's fraud score (owner, 2026-11-27: "show fraud score to me").
    expect(notify).toHaveBeenCalledExactlyOnceWith({ userId: REAL, captureId: real.id, check: saved!.autoCheck, fraud: expect.objectContaining({ score: 75, level: 'high' }) });
  });
});

describe('staff seeing the details before the photos', () => {
  const readBarcode = vi.fn(async (_back: { bytes: Buffer; contentType: string }): Promise<IdBarcodeDetails | null> => license);
  const reveal = (staff: StaffActor, captureId: string, reason = 'Comparing the name and address before approving') =>
    revealIdentityDetails(db, { storage, files: fileCipher, addressCipher: cipher, readBarcode }, staff, { captureId, reason }, now);

  it('needs a deciding role, a reason and a capture', async () => {
    const [real] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, REAL));
    expect(await reveal(alex, real!.id)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reveal(taylor, real!.id, 'short')).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await reveal(taylor, 'idc_nobody')).toEqual({ ok: false, code: 'not_found' });
    expect(readBarcode).not.toHaveBeenCalled();
  });

  it('reads the barcode again, compares it with the account and logs who and why, never what it said', async () => {
    const [real] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, REAL));
    const result = await reveal(taylor, real!.id);
    expect(result).toEqual({
      ok: true,
      details: {
        documentType: 'drivers_license', issuingState: 'FL', name: { given: 'Vera', middle: 'Ann', surname: 'Tester' }, dateOfBirth: '1990-05-01', age: 36,
        expiryDate: '2030-05-01', issueDate: '2022-05-01', documentNumber: 'T123-456-90-001-0', address: license.address, sex: 'female',
        matches: { name: true, address: true, adult: true, notExpired: true },
      },
    });
    expect(readBarcode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readBarcode).mock.calls[0]![0]).toMatchObject({ contentType: 'image/webp' });
    const logged = await db.select().from(auditLog).where(and(eq(auditLog.targetId, REAL), eq(auditLog.action, 'identity_capture.details_viewed')));
    expect(logged).toHaveLength(1);
    expect(logged[0]!.metadata).toMatchObject({ captureId: real!.id });
    expect(JSON.stringify(logged[0])).not.toMatch(/T123|1990|4401/);
  });

  it('says so when there is no barcode to read, or the reader fails, and logs nothing then', async () => {
    const [real] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, REAL));
    readBarcode.mockResolvedValueOnce(null);
    expect(await reveal(taylor, real!.id)).toEqual({ ok: false, code: 'no_barcode' });
    readBarcode.mockRejectedValueOnce(new AiUnavailableError("The server's document reader failed"));
    expect(await reveal(taylor, real!.id)).toEqual({ ok: false, code: 'unavailable' });
    const passport = await capture(PASSPORT, 'passport');
    expect(await reveal(taylor, passport.id)).toEqual({ ok: false, code: 'no_barcode' });
    expect(await db.select().from(auditLog).where(and(eq(auditLog.targetId, REAL), eq(auditLog.action, 'identity_capture.details_viewed')))).toHaveLength(1);
  });

  it("shows a test account made-up details from its own account, so flows and tests can open the panel", async () => {
    readBarcode.mockClear();
    const [test] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, TEST));
    const result = await reveal(taylor, test!.id);
    expect(result).toMatchObject({ ok: true, details: { name: { given: 'Vera', surname: 'Tester' }, documentNumber: 'TEST0000', address: home, matches: { name: true, address: true, adult: true, notExpired: true } } });
    expect(readBarcode).not.toHaveBeenCalled();
  });

  it("never shows a decider their own ID's details; someone else's open", async () => {
    const own = await capture(STAFFER, 'drivers_license');
    const self: StaffActor = { id: STAFFER, roles: ['trust_safety'] };
    readBarcode.mockClear();
    expect(await reveal(self, own.id)).toEqual({ ok: false, code: 'not_allowed' });
    expect(readBarcode).not.toHaveBeenCalled();
    expect(await db.select().from(auditLog).where(and(eq(auditLog.targetId, STAFFER), eq(auditLog.action, 'identity_capture.details_viewed')))).toHaveLength(0);
    const [real] = await db.select().from(identityCaptures).where(eq(identityCaptures.userId, REAL));
    expect(await reveal(self, real!.id)).toMatchObject({ ok: true, details: { matches: { name: true } } });
  });
});
