import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IdDocumentReader } from '@/integrations/ai/id-document-reader';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { saveAccountProfile } from '@/modules/notifications/service';
import { anonymizeAccount } from '@/modules/privacy/requests';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { readPendingIds } from '@/modules/verification/auto-check';
import { acceptIdentityNotice, submitIdentityCapture } from '@/modules/verification/capture';
import { createDevVerificationProviders } from '@/modules/verification/providers';
import { addressVerifications, identityCaptures, identityVerifications, payoutAccounts } from '@/modules/verification/schema';
import { APPROVED_WITHOUT_READING, decideIdentityCapture, getAdminVerificationsPage, getPersonVerification, ID_READING_WAIT_MS, verificationAction } from '@/modules/verification/staff';
import { computeOnboarding } from '@/modules/verification/progress';
import { captureSummary, loadOnboardingState, verificationSummary } from '@/modules/verification/state';
import { runVerificationTimers } from '@/modules/verification/timers';
import { recordIdentityResult, startIdentity } from '@/modules/verification/tracks';
import { auditLog } from '@/platform/audit/schema';
import { createByteCipher, createFieldCipher, createKeyedHasher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The ID check's extras (completion plan 6.3): the same ID on two accounts (a keyed hash from the one
 * reading, never the number; a case for staff and a hold on the double check), an ID running out (a new
 * check 30 days before the end of its expiry month, bookable until then), and a legal-name change.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const root = path.join(os.tmpdir(), `tnm-identity-extras-${process.pid}`);
const storage = createLocalFileStorage(root);
const key = process.env.FIELD_ENCRYPTION_KEY ?? '';
const fileCipher = createByteCipher(key);
const hasher = createKeyedHasher(key, 'tasksnearme.id-document-hash.v1');
const secret = 'test-secret-for-document-links-0123456789';
const deps = { db, storage, files: fileCipher, secret };
const providers = createDevVerificationProviders();
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const alex = { id: 'usr_alex', roles: ['support_agent' as const] };
const FIRST = 'usr_ix_first';
const SECOND = 'usr_ix_second';
const RENEWER = 'usr_ix_renewer';
const LAPSED = 'usr_ix_lapsed';
const RENAMED = 'usr_ix_renamed';
const CLIENT = 'usr_ix_client';
const WAIT_NONE = 'usr_ix_wait_none';
const WAIT_READ = 'usr_ix_wait_read';
const WAIT_DOWN = 'usr_ix_wait_down';
const WAIT_DUP = 'usr_ix_wait_dup';
const PEOPLE = [FIRST, SECOND, RENEWER, LAPSED, RENAMED, CLIENT, WAIT_NONE, WAIT_READ, WAIT_DOWN, WAIT_DUP];
const NUMBER = '31415926';
const t0 = new Date('2026-11-20T16:00:00.000Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';

/** A helper up to the ID step. Not a reserved test domain, so the configured reader (a stub) reads the ID. */
async function helper(id: string) {
  await db.insert(users).values({ id, email: `${id.replace(/_/g, '-')}@qa.tasksnearme-test.net`, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+1512555${String(PEOPLE.indexOf(id)).padStart(2, '0')}66`, phoneVerifiedAt: at(-400), createdAt: at(-400) });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [yard] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: yard!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, at(-400));
}

/** Everything else done, so the ID decides whether they can be booked. */
async function bookableBesidesId(id: string) {
  await db.insert(addressVerifications).values({ id: `adr_${id}`, userId: id, status: 'verified', documentType: 'utility_bill', submittedAt: at(-390), decidedAt: at(-390), createdAt: at(-390) });
  await db.insert(payoutAccounts).values({ userId: id, provider: 'dev', providerAccountId: `acct_${id}`, status: 'active', activatedAt: at(-390), createdAt: at(-390), updatedAt: at(-390) });
}

/** Verified with photos our team approved, whose reading found the ID's expiry month. */
async function verifiedWithId(id: string, expires: { month: number; year: number }, when: Date) {
  await db.insert(identityCaptures).values({
    id: `idc_${id}_${when.getTime()}`, userId: id, documentType: 'drivers_license', promptKey: 'smile', status: 'approved', submittedAt: when, decidedAt: when, decidedByUserId: taylor.id,
    autoCheck: { readable: true, nameMatches: true, isAdult: true, notExpired: true, expiresMonth: expires.month, expiresYear: expires.year, documentType: 'drivers_license', by: 'stub', at: when.toISOString() },
    createdAt: when, updatedAt: when,
  });
  const verifiedAt = new Date(when.getTime() + 3_600_000);
  await db.insert(identityVerifications).values({ id: `idv_${id}_${when.getTime()}`, userId: id, provider: 'dev', providerSessionId: `vs_${id}_${when.getTime()}`, status: 'verified', isAdult: true, nameMatches: true, verifiedAt, createdAt: verifiedAt, updatedAt: verifiedAt });
}

async function photo(name: string) {
  const body = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d9c7b2' } }).jpeg().toBuffer();
  return new File([new Uint8Array(body)], name, { type: 'image/jpeg' });
}
async function captureForm() {
  const form = new FormData();
  form.set('documentType', 'drivers_license');
  for (const kind of ['front', 'back', 'selfie']) form.set(kind, await photo(`${kind}.jpg`));
  return form;
}

/** A reader that transcribes the same license for everyone: the same number, state and birth date. */
const sameLicense: IdDocumentReader = {
  name: 'stub',
  read: vi.fn(async () => ({ readable: true, documentType: 'drivers_license' as const, givenNames: 'Vera', surname: 'Tester', dateOfBirth: '1990-05-01', expiryDate: '2030-08-31', issuingState: 'TX', documentNumber: NUMBER })),
};

const capturesOf = (userId: string) => db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId)).orderBy(identityCaptures.createdAt);
const identityEvents = async (userId: string) =>
  (await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, userId))))
    .map((row) => row.payload)
    .filter((payload) => payload.track === 'identity');
const bookable = async (userId: string, now: Date) => computeOnboarding((await loadOnboardingState(db, userId, now)).facts).progress.bookable;

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db.delete(outboxEvents).where(or(inArray(outboxEvents.aggregateId, PEOPLE), sql`${outboxEvents.payload}::text like ${'%usr_ix_%'}`));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('the same ID on two accounts', () => {
  it('keeps only a keyed hash of the number, state and birth date from the one reading', async () => {
    await helper(FIRST);
    await acceptIdentityNotice(db, FIRST, { consent: true }, at(0));
    expect(await submitIdentityCapture(deps, FIRST, await captureForm(), at(0))).toEqual({ ok: true, code: 'submitted' });
    expect(await readPendingIds(db, { storage, files: fileCipher, reader: sameLicense, hasher }, at(0.01), { userIds: [FIRST] })).toBe(1);
    const [first] = await capturesOf(FIRST);
    expect(first!.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first!.duplicateOfUserId).toBeNull();
    // Nowhere in the row, nor in the audit log: not the number, the birth date or the state.
    expect(JSON.stringify(first)).not.toMatch(new RegExp(`${NUMBER}|1990-05-01|"TX"`));
    const logged = await db.select().from(auditLog).where(eq(auditLog.targetId, FIRST));
    expect(JSON.stringify(logged)).not.toContain(NUMBER);
  });

  it('flags the second account, opens a case for staff and holds the double check', async () => {
    await helper(SECOND);
    await acceptIdentityNotice(db, SECOND, { consent: true }, at(1));
    expect(await submitIdentityCapture(deps, SECOND, await captureForm(), at(1))).toEqual({ ok: true, code: 'submitted' });
    await readPendingIds(db, { storage, files: fileCipher, reader: sameLicense, hasher }, at(1.01), { userIds: [SECOND] });
    const [second] = await capturesOf(SECOND);
    const [first] = await capturesOf(FIRST);
    expect(second).toMatchObject({ documentHash: first!.documentHash, duplicateOfUserId: FIRST });
    const [flagged] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, SECOND), eq(auditLog.action, 'identity_capture.duplicate_id')));
    expect(flagged!.metadata).toEqual({ captureId: second!.id, otherUserId: FIRST });

    // Staff can still approve the photos; the double check waits for the duplicate.
    expect(await decideIdentityCapture(db, taylor, { captureId: second!.id, decision: 'approve', note: 'License and selfie match.' }, at(1.1))).toEqual({ ok: true, code: 'updated' });
    const state = await loadOnboardingState(db, SECOND, at(1.1));
    expect(state.identity).toMatchObject({ blocked: 'duplicate_id', captureApproved: true, canStart: false });
    expect(verificationSummary(state, false, null).identity.blocked).toBe('duplicate_id');
    expect(await startIdentity(db, providers, SECOND, at(1.1), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });

    const queue = await getAdminVerificationsPage(db, taylor, 'identity', at(1.1));
    expect(queue.identity.find((row) => row.person.id === SECOND)).toMatchObject({ kind: 'duplicate_id', duplicate: { others: [expect.objectContaining({ id: FIRST })] } });
    const view = await getPersonVerification(db, taylor, SECOND, at(1.1));
    expect(view.identity.blocked).toBe('duplicate_id');
    expect(view.identity.captures[0]).toMatchObject({ status: 'approved', duplicateOf: [expect.objectContaining({ id: FIRST })] });
    expect(view.actions).toEqual(expect.arrayContaining(['clear_duplicate_id', 'reject_duplicate_id']));
    expect(await verificationAction(db, providers, alex, { userId: SECOND, action: 'clear_duplicate_id', note: 'Same person, older account.' }, at(1.2))).toEqual({ ok: false, code: 'not_allowed' });

    // Cleared: the double check can go ahead.
    expect(await verificationAction(db, providers, taylor, { userId: SECOND, action: 'clear_duplicate_id', note: 'The same person: the older account is closing.' }, at(1.2))).toEqual({ ok: true, code: 'updated' });
    expect((await capturesOf(SECOND))[0]).toMatchObject({ duplicateClearedByUserId: taylor.id });
    expect((await loadOnboardingState(db, SECOND, at(1.2))).identity).toMatchObject({ canStart: true });
    expect((await getAdminVerificationsPage(db, taylor, 'identity', at(1.2))).identity.find((row) => row.person.id === SECOND)).toBeUndefined();
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, SECOND), eq(auditLog.action, 'verification.clear_duplicate_id')));
    expect(audit).toMatchObject({ actorId: taylor.id, reason: 'The same person: the older account is closing.', metadata: { captureId: second!.id, otherUserId: FIRST } });
  });

  it('lets staff turn photos with someone else\'s ID down, and the helper sees why', async () => {
    // Staff ask the second account for a new check, and it sends the same license again.
    await db.insert(identityVerifications).values({ id: 'idv_ix_reset', userId: SECOND, provider: 'dev', providerSessionId: null, status: 'not_started', requestedReason: 'staff_request', requestedByUserId: taylor.id, createdAt: at(2), updatedAt: at(2) });
    expect(await submitIdentityCapture(deps, SECOND, await captureForm(), at(2.01))).toEqual({ ok: true, code: 'submitted' });
    await readPendingIds(db, { storage, files: fileCipher, reader: sameLicense, hasher }, at(2.02), { userIds: [SECOND] });
    expect((await loadOnboardingState(db, SECOND, at(2.02))).identity.blocked).toBe('duplicate_id');
    expect(await verificationAction(db, providers, taylor, { userId: SECOND, action: 'reject_duplicate_id', note: 'The license is the first account holder\'s.' }, at(2.1))).toEqual({ ok: true, code: 'updated' });
    const latest = (await capturesOf(SECOND)).at(-1)!;
    expect(latest).toMatchObject({ status: 'rejected', rejectionReason: 'duplicate_id', decidedByUserId: taylor.id });
    const state = await loadOnboardingState(db, SECOND, at(2.1));
    expect(state.identity.blocked).toBeUndefined();
    expect(captureSummary(state, secret)).toMatchObject({ stage: 'needed', rejectionReason: 'duplicate_id' });
    expect((await identityEvents(SECOND)).filter((payload) => payload.outcome === 'action_needed').length).toBeGreaterThanOrEqual(3);
  });

  it('forgets the hash when the account is deleted', async () => {
    await anonymizeAccount(db, { storage, cipher: createFieldCipher(key), email: { name: 'memory', send: async () => {} } as never, appUrl: 'http://localhost:3000' }, FIRST, at(3));
    expect((await capturesOf(FIRST)).every((row) => row.documentHash === null)).toBe(true);
  });
});

describe('an ID that runs out', () => {
  // The license runs out in December 2026: it counts until Jan 1, 2027 at midnight in Austin.
  const end = new Date('2027-01-01T06:00:00.000Z');
  const before = (days: number) => new Date(end.getTime() - days * DAY);

  it('asks for a new check 30 days before, keeps the helper bookable until the month ends, then pauses them', async () => {
    await helper(LAPSED);
    await bookableBesidesId(LAPSED);
    await verifiedWithId(LAPSED, { month: 12, year: 2026 }, at(-100));
    await runVerificationTimers(db, { storage, providers }, before(31), { userIds: [LAPSED] });
    expect(await bookable(LAPSED, before(31))).toBe(true);
    expect(await db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, LAPSED), eq(identityVerifications.requestedReason, 'id_expiring')))).toHaveLength(0);

    expect((await runVerificationTimers(db, { storage, providers }, before(30), { userIds: [LAPSED] })).idRenewals).toBe(1);
    const [asked] = await db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, LAPSED), eq(identityVerifications.requestedReason, 'id_expiring')));
    expect(asked).toMatchObject({ providerSessionId: null, status: 'not_started', expiryNotices: 1 });
    expect(await identityEvents(LAPSED)).toEqual([{ userId: LAPSED, track: 'identity', outcome: 'expiring', days: 30 }]);
    // Still bookable, still verified to clients, and the new check is open.
    const state = await loadOnboardingState(db, LAPSED, before(29));
    expect(state.identity).toMatchObject({ cleared: true, requested: 'id_expiring', renewal: { countsUntil: end }, canCapture: true });
    expect(verificationSummary(state, false, null).identity).toMatchObject({ requested: 'id_expiring', renewal: { countsUntil: end.toISOString() } });
    expect(await bookable(LAPSED, before(29))).toBe(true);
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, LAPSED));
    expect(profile!.idVerifiedAt).not.toBeNull();
    // Asked once.
    await runVerificationTimers(db, { storage, providers }, before(20), { userIds: [LAPSED] });
    expect(await identityEvents(LAPSED)).toHaveLength(1);

    // The month ends without a new check: told once, and no longer bookable.
    await runVerificationTimers(db, { storage, providers }, end, { userIds: [LAPSED] });
    await runVerificationTimers(db, { storage, providers }, new Date(end.getTime() + DAY), { userIds: [LAPSED] });
    expect((await identityEvents(LAPSED)).map((payload) => payload.outcome)).toEqual(['expiring', 'expired']);
    expect(await bookable(LAPSED, end)).toBe(false);
    expect((await loadOnboardingState(db, LAPSED, end)).identity).toMatchObject({ cleared: false, requested: 'id_expired' });
    const [after] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, LAPSED));
    expect(after!.idVerifiedAt).toBeNull();
  });

  it('carries on without a gap when the new check passes in time', async () => {
    await helper(RENEWER);
    await bookableBesidesId(RENEWER);
    await recordAgreement(db, RENEWER, 'biometric_consent', {}, at(-101));
    await verifiedWithId(RENEWER, { month: 12, year: 2026 }, at(-100));
    await runVerificationTimers(db, { storage, providers }, before(30), { userIds: [RENEWER] });
    // New photos of the new license, approved by our team, then the double check.
    expect(await submitIdentityCapture(deps, RENEWER, await captureForm(), before(25))).toEqual({ ok: true, code: 'submitted' });
    const fresh = (await capturesOf(RENEWER)).at(-1)!;
    await db.update(identityCaptures).set({ autoCheck: { readable: true, nameMatches: true, isAdult: true, notExpired: true, expiresMonth: 5, expiresYear: 2031, documentType: 'drivers_license', by: 'stub', at: before(25).toISOString() } }).where(eq(identityCaptures.id, fresh.id));
    expect(await decideIdentityCapture(db, taylor, { captureId: fresh.id, decision: 'approve', note: 'New license; selfie matches.' }, before(24))).toEqual({ ok: true, code: 'updated' });
    expect(await bookable(RENEWER, before(24))).toBe(true);
    const start = await startIdentity(db, providers, RENEWER, before(24));
    if (!start.ok) throw new Error('the double check did not start');
    // While the double check runs, the earlier check still counts.
    expect(await bookable(RENEWER, before(24))).toBe(true);
    await recordIdentityResult(db, param(start.redirectTo!, 'session'), { status: 'verified', verifiedName: { firstName: 'Vera', lastName: 'Tester' } }, before(23));
    expect((await loadOnboardingState(db, RENEWER, end)).identity).toMatchObject({ verified: true, cleared: true, expiresAt: new Date('2031-06-01T05:00:00.000Z') });
    await runVerificationTimers(db, { storage, providers }, end, { userIds: [RENEWER] });
    expect(await bookable(RENEWER, end)).toBe(true);
    expect((await identityEvents(RENEWER)).filter((payload) => payload.outcome === 'expired')).toEqual([]);
  });
});

describe('a legal-name change', () => {
  it('asks a verified helper for a new ID check, and nobody else', async () => {
    await helper(RENAMED);
    await bookableBesidesId(RENAMED);
    await verifiedWithId(RENAMED, { month: 4, year: 2030 }, at(-10));
    // Case and punctuation aren't a change.
    expect(await saveAccountProfile(db, RENAMED, { firstName: 'VERA', lastName: 'tester' }, at(0))).toEqual({ ok: true, code: 'saved' });
    expect(await db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, RENAMED), eq(identityVerifications.requestedReason, 'name_changed')))).toHaveLength(0);
    expect(await bookable(RENAMED, at(0))).toBe(true);

    expect(await saveAccountProfile(db, RENAMED, { firstName: 'Vera', lastName: 'Okafor' }, at(1))).toEqual({ ok: true, code: 'saved' });
    const state = await loadOnboardingState(db, RENAMED, at(1));
    expect(state.identity).toMatchObject({ verified: false, cleared: false, requested: 'name_changed', canCapture: true });
    expect(await bookable(RENAMED, at(1))).toBe(false);
    expect((await identityEvents(RENAMED)).map((payload) => payload.outcome)).toEqual(['action_needed']);
    // Changing it again while the new check is due asks for nothing more.
    await saveAccountProfile(db, RENAMED, { firstName: 'Vera', lastName: 'Okafor-Tester' }, at(2));
    expect(await db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, RENAMED), eq(identityVerifications.requestedReason, 'name_changed')))).toHaveLength(1);
    // A client with a verified ID (no helper profile): nothing to ask.
    await db.insert(users).values({ id: CLIENT, email: 'ix-client@qa.tasksnearme-test.net', name: 'Cleo C.', firstName: 'Cleo', lastName: 'Client', createdAt: at(-60) });
    await db.insert(identityVerifications).values({ id: 'idv_ix_client', userId: CLIENT, provider: 'dev', providerSessionId: 'vs_ix_client', status: 'verified', isAdult: true, nameMatches: true, verifiedAt: at(-5), createdAt: at(-5), updatedAt: at(-5) });
    expect(await saveAccountProfile(db, CLIENT, { firstName: 'Cleo', lastName: 'Newname' }, at(2))).toEqual({ ok: true, code: 'saved' });
    expect(await db.select().from(identityVerifications).where(and(eq(identityVerifications.userId, CLIENT), eq(identityVerifications.requestedReason, 'name_changed')))).toHaveLength(0);
  });
});

describe('approval waits for the automatic reading (5.18)', () => {
  const reading = (reader: IdDocumentReader | null) => ({ storage, files: fileCipher, reader, hasher });
  /** Another person's license: no duplicate with anyone above. */
  const ownLicense = (number: string): IdDocumentReader => ({ name: 'stub', read: async () => ({ readable: true, documentType: 'drivers_license' as const, givenNames: 'Vera', surname: 'Tester', dateOfBirth: '1991-02-03', expiryDate: '2031-01-31', issuingState: 'TX', documentNumber: number }) });
  const broken: IdDocumentReader = { name: 'stub', read: async () => { throw new Error('the reader crashed'); } };
  const submitted = async (id: string, when: Date) => {
    await helper(id);
    await acceptIdentityNotice(db, id, { consent: true }, when);
    expect(await submitIdentityCapture(deps, id, await captureForm(), when)).toEqual({ ok: true, code: 'submitted' });
    return (await capturesOf(id)).at(-1)!;
  };
  const approve = (captureId: string, when: Date, reader: IdDocumentReader | null) => decideIdentityCapture(db, taylor, { captureId, decision: 'approve', note: 'License and selfie match.' }, when, { reading: reading(reader) });
  const approvalAudit = async (userId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.targetId, userId), eq(auditLog.action, 'identity_capture.approved'))))[0];

  it('without a reader, approves without the reading and the audit log says so', async () => {
    const capture = await submitted(WAIT_NONE, at(10));
    const view = await getPersonVerification(db, taylor, WAIT_NONE, at(10), false);
    expect(view.identity.captures[0]!.reading).toEqual({ state: 'skipped', why: 'no_reader' });
    expect(await approve(capture.id, at(10), null)).toEqual({ ok: true, code: 'updated' });
    expect((await approvalAudit(WAIT_NONE))!.metadata).toMatchObject({ captureId: capture.id, withoutReading: 'no_reader', remark: APPROVED_WITHOUT_READING });
  });

  it('reads the photos first when the job hasn’t, so the ID is hashed before anyone approves', async () => {
    const capture = await submitted(WAIT_READ, at(11));
    const view = await getPersonVerification(db, taylor, WAIT_READ, at(11), true);
    expect(view.identity.captures[0]!.reading).toEqual({ state: 'waiting', until: new Date(at(11).getTime() + ID_READING_WAIT_MS).toISOString() });
    expect(await approve(capture.id, at(11), ownLicense('27182818'))).toEqual({ ok: true, code: 'updated' });
    const [read] = await capturesOf(WAIT_READ);
    expect(read).toMatchObject({ status: 'approved', autoCheck: expect.objectContaining({ readable: true }) });
    expect(read!.documentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await approvalAudit(WAIT_READ))!.metadata).not.toHaveProperty('withoutReading');
  });

  it('holds approval while the reader fails, for 15 minutes; then lets it through without the reading', async () => {
    const capture = await submitted(WAIT_DOWN, at(12));
    expect(await approve(capture.id, new Date(at(12).getTime() + 60_000), broken)).toEqual({ ok: false, code: 'not_ready' });
    expect((await capturesOf(WAIT_DOWN))[0]!.status).toBe('submitted');
    expect(await approve(capture.id, new Date(at(12).getTime() + ID_READING_WAIT_MS + 60_000), broken)).toEqual({ ok: true, code: 'updated' });
    expect((await approvalAudit(WAIT_DOWN))!.metadata).toMatchObject({ withoutReading: 'timed_out', remark: APPROVED_WITHOUT_READING });
  });

  it('stops the approval when that reading finds the same ID on another account, and shows it to the deciders only', async () => {
    const capture = await submitted(WAIT_DUP, at(13));
    expect(await approve(capture.id, at(13), sameLicense)).toEqual({ ok: false, code: 'version_conflict' });
    // The same license as the accounts above (whichever of them the flag names).
    const [flagged] = await capturesOf(WAIT_DUP);
    expect(flagged).toMatchObject({ status: 'submitted', duplicateOfUserId: expect.stringMatching(/^usr_ix_(first|second)$/) });
    const other = flagged!.duplicateOfUserId!;
    // Who else holds the ID: the capture deciders (trust and safety here) see it; a support agent sees none.
    const forTaylor = await getPersonVerification(db, taylor, WAIT_DUP, at(13), true);
    expect(forTaylor.identity.captures[0]!.duplicateOf?.map((person) => person.id)).toContain(other);
    const forAlex = await getPersonVerification(db, alex, WAIT_DUP, at(13), true);
    expect(forAlex.identity.captures[0]!.duplicateOf).toBeUndefined();
    const queueRow = (page: Awaited<ReturnType<typeof getAdminVerificationsPage>>) => page.identity.find((row) => row.id === capture.id);
    expect(queueRow(await getAdminVerificationsPage(db, taylor, 'identity', at(13), true))?.duplicate?.others.map((person) => person.id)).toContain(other);
    expect(queueRow(await getAdminVerificationsPage(db, alex, 'identity', at(13), true))?.duplicate?.others).toEqual([]);
  });
});
