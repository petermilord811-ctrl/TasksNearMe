import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IdDocumentDetails } from '@/contracts';
import type { IdDocumentReader, IdDocumentReading } from '@/integrations/ai/id-document-reader';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { categories, featureFlags } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { readPendingIds } from '@/modules/verification/auto-check';
import type { IdReadingNotice } from '@/modules/verification/notify-deciders';
import { acceptIdentityNotice, submitIdentityCapture } from '@/modules/verification/capture';
import { createDevVerificationProviders } from '@/modules/verification/providers';
import { identityCaptures, identityVerifications, type StoredIdentityAutoCheck } from '@/modules/verification/schema';
import { decideIdentityCapture } from '@/modules/verification/staff';
import { captureSummary, loadOnboardingState } from '@/modules/verification/state';
import { runVerificationTimers } from '@/modules/verification/timers';
import { auditLog } from '@/platform/audit/schema';
import { createByteCipher, createFieldCipher, createKeyedHasher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Our own ID check decided by its automatic checks (owner, 2026-11-27: "verify the correct issued and non-fake DL, store
 * DL infos and images for further possible manual review"): a clean reading approves the photos at once and, with no ID
 * provider to double-check, verifies the ID (a verification of provider `own`); an expired ID read from its barcode is
 * turned down; anything doubtful, or every reading with automatic decisions off, waits for staff, whose approval also
 * verifies without a provider. What was read is kept encrypted with the photos, and both go a year after the decision.
 * The reader is a stub that answers as the server's reader does.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const root = path.join(os.tmpdir(), `tnm-id-auto-${process.pid}`);
const storage = createLocalFileStorage(root);
const key = process.env.FIELD_ENCRYPTION_KEY ?? '';
const fileCipher = createByteCipher(key);
const fieldCipher = createFieldCipher(key);
const hasher = createKeyedHasher(key, 'tasksnearme.id-document-hash.v1');
const secret = 'test-secret-for-document-links-0123456789';
const deps = { db, storage, files: fileCipher, secret };
const providers = createDevVerificationProviders();
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const CLEAN = 'usr_ad_clean';
const DOUBLE = 'usr_ad_double';
const EXPIRED = 'usr_ad_expired';
const DOUBTFUL = 'usr_ad_doubtful';
const FLAG_OFF = 'usr_ad_flag_off';
const TEAM = 'usr_ad_team';
const PEOPLE = [CLEAN, DOUBLE, EXPIRED, DOUBTFUL, FLAG_OFF, TEAM];
/** Automatic ID decisions are off by default since 2026-11-27 (our team double-checks every ID): Austin's own flag turns them on here. */
const autoIdDecisions = (enabled: boolean) =>
  db.insert(featureFlags).values({ key: 'auto_verification_id', marketId: 'mkt_austin', enabled, description: 'test' }).onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled } });
const t0 = new Date('2026-11-27T15:00:00.000Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

async function helper(id: string, market = 'mkt_austin') {
  await db.insert(users).values({ id, email: `${id.replace(/_/g, '-')}@qa.tasksnearme-test.net`, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+1352777${String(PEOPLE.indexOf(id)).padStart(2, '0')}91`, phoneVerifiedAt: at(-30), createdAt: at(-30), homeMarketId: market });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [yard] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: yard!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, at(-30));
  await acceptIdentityNotice(db, id, { consent: true }, at(-1));
}

async function sent(id: string) {
  const form = new FormData();
  form.set('documentType', 'drivers_license');
  for (const kind of ['front', 'back', 'selfie']) {
    const body = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9c7b2' } }).jpeg().toBuffer();
    form.set(kind, new File([new Uint8Array(body)], `${kind}.jpg`, { type: 'image/jpeg' }));
  }
  expect(await submitIdentityCapture(deps, id, form, at(0))).toEqual({ ok: true, code: 'submitted' });
  return (await db.select().from(identityCaptures).where(eq(identityCaptures.userId, id)).orderBy(asc(identityCaptures.createdAt))).at(-1)!;
}

/** What the server's reader answers for a clean Florida license (its own number per person, so no duplicates). */
function reading(number: string, changes: Partial<IdDocumentReading> = {}): IdDocumentReading {
  const details: IdDocumentDetails = { source: 'barcode', documentType: 'drivers_license', issuingState: 'FL', givenNames: 'VERA', surname: 'TESTER', dateOfBirth: '1990-05-01', issueDate: '2023-05-01', expiryDate: '2031-05-01', documentNumber: number, licenseClass: 'E', inventoryControl: '0110009295000261' };
  return {
    readable: true,
    source: 'barcode',
    documentType: 'drivers_license',
    givenNames: 'VERA',
    surname: 'TESTER',
    dateOfBirth: '1990-05-01',
    expiryDate: '2031-05-01',
    issuingState: 'FL',
    documentNumber: number,
    frontAgrees: true,
    genuine: { outcome: 'pass', signals: ['number_derivation_ok'] },
    face: { faceMatch: 'pass', live: 'pass', signals: ['pose_followed'], photocopy: false, score: { similarity: 0.71, matchAt: 0.45, mismatchBelow: 0.3 }, liveness: 0.99 },
    details,
    ...changes,
  };
}
const reader = (answer: IdDocumentReading): IdDocumentReader => ({ name: 'stub', read: async () => answer });
const read = (id: string, answer: IdDocumentReading, extra: { doubleCheck?: boolean; notify?: (notice: IdReadingNotice) => Promise<unknown> } = {}) =>
  readPendingIds(db, { storage, files: fileCipher, reader: reader(answer), hasher, detailsCipher: fieldCipher, doubleCheck: extra.doubleCheck ?? false, ...(extra.notify ? { notify: extra.notify } : {}) }, at(0.01), { userIds: [id] });
const captureOf = async (id: string) => (await db.select().from(identityCaptures).where(eq(identityCaptures.userId, id)).orderBy(asc(identityCaptures.createdAt))).at(-1)!;
const ownRows = (id: string) => db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, id), eq(identityVerifications.provider, 'own')));
const identityEvents = async (id: string) =>
  (await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, id))).orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id)))
    .map((row) => row.payload)
    .filter((payload) => payload.track === 'identity');

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
  for (const id of PEOPLE) await helper(id);
  await autoIdDecisions(true);
});

afterAll(async () => {
  await db.delete(featureFlags).where(and(eq(featureFlags.key, 'auto_verification_id'), eq(featureFlags.marketId, 'mkt_austin')));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('a clean reading', () => {
  it('approves the photos at once and, with no ID provider, verifies the ID with our own check', async () => {
    const capture = await sent(CLEAN);
    expect(await read(CLEAN, reading('T236000000001'))).toBe(1);
    const decided = await captureOf(CLEAN);
    expect(decided).toMatchObject({ id: capture.id, status: 'approved', decidedBy: 'auto', decidedByUserId: null, rejectionReason: null });
    const check = decided.autoCheck as StoredIdentityAutoCheck;
    expect(check.decision).toBe('approved');
    expect(check.checks).toHaveLength(10);
    expect(check.checks!.every((item) => item.outcome === 'pass')).toBe(true);
    expect(check.face).toEqual({ similarity: 0.71, matchAt: 0.45, mismatchBelow: 0.3 });
    // The answers never hold the ID's details; the encrypted column does.
    expect(JSON.stringify(check)).not.toContain('T236000000001');
    expect(JSON.parse(fieldCipher.decrypt(decided.detailsCiphertext!))).toMatchObject({ documentNumber: 'T236000000001', surname: 'TESTER', licenseClass: 'E' });
    const [own] = await ownRows(CLEAN);
    expect(own).toMatchObject({ status: 'verified', providerSessionId: capture.id, nameMatches: true, isAdult: true });
    const state = await loadOnboardingState(db, CLEAN, at(0.02));
    expect(state.identity).toMatchObject({ verified: true, cleared: true });
    expect(captureSummary(state, secret, false).stage).toBe('done');
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, CLEAN));
    expect(profile!.idVerifiedAt).not.toBeNull();
    expect((await identityEvents(CLEAN)).at(-1)).toMatchObject({ outcome: 'passed' });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, CLEAN), eq(auditLog.action, 'identity_capture.approved')));
    expect(audit).toMatchObject({ actorRole: 'system', actorId: null });
    expect(audit!.metadata).toMatchObject({ captureId: capture.id, by: 'auto', verified: 'own' });
  });

  it('with an ID provider set up, opens the double check instead of verifying', async () => {
    await sent(DOUBLE);
    await read(DOUBLE, reading('T236000000002'), { doubleCheck: true });
    expect(await captureOf(DOUBLE)).toMatchObject({ status: 'approved', decidedBy: 'auto' });
    expect(await ownRows(DOUBLE)).toHaveLength(0);
    const state = await loadOnboardingState(db, DOUBLE, at(0.02));
    expect(state.identity).toMatchObject({ verified: false, captureApproved: true });
    expect(captureSummary(state, secret, true)).toMatchObject({ stage: 'approved', doubleCheck: true });
  });
});

describe('an objective failure', () => {
  it('turns down an expired ID read from its barcode, with that reason', async () => {
    await sent(EXPIRED);
    await read(EXPIRED, reading('T236000000003', { expiryDate: '2025-05-01' }));
    expect(await captureOf(EXPIRED)).toMatchObject({ status: 'rejected', rejectionReason: 'expired', decidedBy: 'auto' });
    expect(await ownRows(EXPIRED)).toHaveLength(0);
    expect((await identityEvents(EXPIRED)).at(-1)).toMatchObject({ outcome: 'action_needed' });
    // A new try is open within the limits.
    expect((await loadOnboardingState(db, EXPIRED, at(0.02))).identity.canCapture).toBe(true);
  });
});

describe('a doubtful reading', () => {
  it('waits for staff, who are told, and their approval verifies the ID without a provider', async () => {
    const capture = await sent(DOUBTFUL);
    const notify = vi.fn(async () => undefined);
    await read(DOUBTFUL, reading('T236000000004', { face: { faceMatch: 'unsure', live: 'pass', signals: ['face_weak_match', 'pose_followed'], photocopy: false, score: { similarity: 0.38, matchAt: 0.45, mismatchBelow: 0.3 }, liveness: 0.97 } }), { notify });
    const waiting = await captureOf(DOUBTFUL);
    expect(waiting.status).toBe('submitted');
    expect((waiting.autoCheck as StoredIdentityAutoCheck).decision).toBe('review');
    expect((waiting.autoCheck as StoredIdentityAutoCheck).signals).toContain('face_weak_match');
    expect(notify).toHaveBeenCalledTimes(1);

    expect(await decideIdentityCapture(db, taylor, { captureId: capture.id, decision: 'approve', note: 'Older photo on the license; same person.' }, at(0.5), { doubleCheck: false })).toEqual({ ok: true, code: 'updated' });
    expect(await captureOf(DOUBTFUL)).toMatchObject({ status: 'approved', decidedBy: 'staff', decidedByUserId: taylor.id });
    expect(await ownRows(DOUBTFUL)).toHaveLength(1);
    expect((await loadOnboardingState(db, DOUBTFUL, at(0.5))).identity).toMatchObject({ verified: true, cleared: true });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, DOUBTFUL), eq(auditLog.action, 'identity_capture.approved')));
    expect(audit).toMatchObject({ actorId: taylor.id });
    expect(audit!.metadata).toMatchObject({ captureId: capture.id, verified: 'own' });
  });

  it('with automatic decisions off for the market, a clean reading waits for staff too', async () => {
    // The market's own flag wins over the global one.
    await autoIdDecisions(false);
    try {
      await sent(FLAG_OFF);
      await read(FLAG_OFF, reading('T236000000005'));
      const waiting = await captureOf(FLAG_OFF);
      expect(waiting.status).toBe('submitted');
      expect((waiting.autoCheck as StoredIdentityAutoCheck).decision).toBe('review');
      expect((waiting.autoCheck as StoredIdentityAutoCheck).checks!.every((item) => item.outcome === 'pass')).toBe(true);
    } finally {
      await autoIdDecisions(true);
    }
  });

  it('by default our team double-checks every ID, and hears its fraud score (owner, 2026-11-27)', async () => {
    await db.delete(featureFlags).where(and(eq(featureFlags.key, 'auto_verification_id'), eq(featureFlags.marketId, 'mkt_austin')));
    try {
      await sent(TEAM);
      const notify = vi.fn(async (notice: IdReadingNotice) => notice);
      await read(TEAM, reading('T236000000006'), { notify });
      const waiting = await captureOf(TEAM);
      expect(waiting.status).toBe('submitted');
      expect((waiting.autoCheck as StoredIdentityAutoCheck).decision).toBe('review');
      expect((waiting.autoCheck as StoredIdentityAutoCheck).checks!.every((item) => item.outcome === 'pass')).toBe(true);
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: TEAM, fraud: { score: 0, level: 'low', factors: [] } }));
    } finally {
      await autoIdDecisions(true);
    }
  });
});

describe('keeping what was read', () => {
  it('keeps the photos and the details a year after the decision, then deletes both', async () => {
    const decided = await captureOf(CLEAN);
    expect((await runVerificationTimers(db, { storage, providers }, at(364), { userIds: [CLEAN] })).idPhotosDeleted).toBe(0);
    expect((await captureOf(CLEAN)).detailsCiphertext).not.toBeNull();
    expect((await runVerificationTimers(db, { storage, providers }, at(365.1), { userIds: [CLEAN] })).idPhotosDeleted).toBe(1);
    const gone = await captureOf(CLEAN);
    expect(gone).toMatchObject({ id: decided.id, status: 'approved', frontFileId: null, backFileId: null, selfieFileId: null, detailsCiphertext: null });
    expect(gone.autoCheck).not.toBeNull();
    // Our own verification holds no images at a provider: nothing is asked to be redacted.
    expect((await ownRows(CLEAN))[0]!.redactionRequestedAt).toBeNull();
  });
});
