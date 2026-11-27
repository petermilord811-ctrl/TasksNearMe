import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { users } from '@/modules/accounts/schema';
import { areas, categories } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { files } from '@/modules/tasks/schema';
import { canViewFile } from '@/modules/files/access';
import { submitAddressProof } from '@/modules/verification/address';
import { createDevVerificationProviders } from '@/modules/verification/providers';
import { addressVerifications, backgroundChecks, identityCaptures, identityVerifications, payoutAccounts } from '@/modules/verification/schema';
import { decideAddress, documentForToken, getAdminVerificationsPage, getPersonVerification, readDocumentToken, revealAddressProof, verificationAction } from '@/modules/verification/staff';
import { loadOnboardingState } from '@/modules/verification/state';
import { runVerificationTimers } from '@/modules/verification/timers';
import { recordBackgroundResult, recordIdentityResult, startBackgroundCheck, startIdentity } from '@/modules/verification/tracks';
import { auditLog } from '@/platform/audit/schema';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * The verification tracks (added 2026-11-12): proof of address with staff review and document privacy,
 * ID attempts, name checks and staff requests, background adjudication and renewal, and the timers.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const root = path.join(os.tmpdir(), `tnm-verification-${process.pid}`);
const storage = createLocalFileStorage(root);
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const secret = 'test-secret-for-document-links-0123456789';
const providers = createDevVerificationProviders();
const geocoder = createFakeGeocoder();
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const alex = { id: 'usr_alex', roles: ['support_agent' as const] };
const morgan = { id: 'usr_morgan', roles: ['support_lead' as const] };
const riley = { id: 'usr_riley', roles: ['admin' as const] };
const PEOPLE = ['usr_vt_address', 'usr_vt_identity', 'usr_vt_background', 'usr_vt_bg_where', 'usr_vt_address_waco'];
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';
const t0 = new Date('2026-11-20T16:00:00.000Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

/** A helper up to the step a test needs: basics, phone, agreement (and optionally ID and payouts). */
async function helper(id: string, options: { identity?: boolean; payout?: boolean; inHome?: boolean } = {}) {
  await db.insert(users).values({ id, email: `${id}@example.test`, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+1512555${id.length}${PEOPLE.indexOf(id)}99`, phoneVerifiedAt: at(-30), createdAt: at(-30), homeMarketId: 'mkt_austin' });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, options.inHome ? 'light-cleaning' : 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: cat!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, at(-30));
  if (options.identity) {
    await db.insert(identityVerifications).values({ id: `idv_${id}`, userId: id, provider: 'dev', providerSessionId: `vs_${id}`, status: 'verified', isAdult: true, nameMatches: true, verifiedAt: at(-29), createdAt: at(-29), updatedAt: at(-29) });
  }
  if (options.payout) {
    await db.insert(payoutAccounts).values({ userId: id, provider: 'dev', providerAccountId: `acct_${id}`, status: 'active', activatedAt: at(-28), createdAt: at(-28), updatedAt: at(-28) });
  }
}

/** Our own ID check (stage 1) approved, as staff would: the provider's double check can open. It counts as a try. */
async function photosApproved(id: string, when: Date) {
  await db.insert(identityCaptures).values({ id: `idc_${id}_${when.getTime()}`, userId: id, documentType: 'drivers_license', promptKey: 'smile', status: 'approved', submittedAt: when, decidedAt: when, decidedByUserId: 'usr_taylor', createdAt: when, updatedAt: when });
}

async function photoFile(name = 'bill.jpg') {
  const body = await sharp({ create: { width: 1000, height: 1300, channels: 3, background: '#fafafa' } })
    .withMetadata({ exif: { IFD0: { Artist: 'Secret Person', Copyright: 'GPS 30.2985,-97.7042' } } })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(body)], name, { type: 'image/jpeg' });
}

function proofForm(fields: Record<string, string>, file?: File) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('file', file);
  return form;
}

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('proof of address', () => {
  const id = 'usr_vt_address';
  const deps = { db, storage, geocoder, cipher };

  it('opens with the basics, before the ID check (any order, 2026-11-23), and checks every field and the file', async () => {
    await helper(id);
    const valid = { placeId: 'plc_mueller_1234', documentType: 'utility_bill', declaration: 'true' };
    await db.insert(identityVerifications).values({ id: `idv_${id}`, userId: id, provider: 'dev', providerSessionId: `vs_${id}`, status: 'verified', isAdult: true, nameMatches: true, verifiedAt: at(-1), createdAt: at(-1), updatedAt: at(-1) });

    expect(await submitAddressProof(deps, id, proofForm({ placeId: '', documentType: 'selfie', declaration: 'false' }), at(0))).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { file: ['required'], placeId: ['required'], documentType: ['required'], declaration: ['must_accept'] },
    });
    // A forged place id.
    expect(await submitAddressProof(deps, id, proofForm({ ...valid, placeId: 'plc_nowhere' }, await photoFile()), at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { placeId: ['invalid'] } });
    // A "PDF" that isn't one.
    const fake = new File([new TextEncoder().encode('<html><script>alert(1)</script></html>')], 'bill.pdf', { type: 'application/pdf' });
    expect(await submitAddressProof(deps, id, proofForm(valid, fake), at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { file: ['invalid'] } });
    const text = new File([new TextEncoder().encode('hello')], 'bill.txt', { type: 'text/plain' });
    expect(await submitAddressProof(deps, id, proofForm(valid, text), at(0))).toEqual({ ok: false, code: 'unsupported_type' });
  });

  it('verifies a home anywhere in the US: one in Waco belongs to its city\'s area (owner, 2026-11-23)', async () => {
    const waco = 'usr_vt_address_waco';
    await helper(waco);
    expect(await submitAddressProof(deps, waco, proofForm({ placeId: 'plc_waco_100', documentType: 'utility_bill', declaration: 'true' }, await photoFile()), at(0))).toEqual({ ok: true, code: 'submitted' });
    const [row] = await db.select({ slug: areas.slug }).from(addressVerifications).innerJoin(areas, eq(areas.id, addressVerifications.areaId)).where(eq(addressVerifications.userId, waco));
    expect(row!.slug).toBe('city-waco-tx');
  });

  it('stores the address encrypted and the photo without its metadata, then waits for review', async () => {
    const valid = { placeId: 'plc_mueller_1234', line2: 'Apt 2', documentType: 'utility_bill', declaration: 'true' };
    expect(await submitAddressProof(deps, id, proofForm(valid, await photoFile()), at(0))).toEqual({ ok: true, code: 'submitted' });
    const [row] = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, id));
    expect(row).toMatchObject({ status: 'in_review', areaId: 'area_mueller', documentType: 'utility_bill' });
    expect(row!.addressCiphertext).not.toContain('Example Lane');
    expect(JSON.parse(cipher.decrypt(row!.addressCiphertext!))).toEqual({ line1: '1234 Example Lane', line2: 'Apt 2', city: 'Austin', state: 'TX', zip: '78723' });
    const [file] = await db.select().from(files).where(eq(files.id, row!.documentFileId!));
    expect(file).toMatchObject({ kind: 'address_proof', contentType: 'image/webp', ownerUserId: id });
    const stored = await storage.get(file!.storageKey);
    const metadata = await sharp(stored!).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(stored!.toString('latin1')).not.toContain('Secret Person');
    // Not served by the general file route, not even to its owner or staff.
    expect(canViewFile(file!, { userId: id })).toBe(false);
    expect(canViewFile(file!, { userId: 'usr_taylor' })).toBe(false);
    // One proof at a time.
    expect(await submitAddressProof(deps, id, proofForm(valid, await photoFile()), at(0))).toEqual({ ok: false, code: 'not_allowed' });
    expect((await loadOnboardingState(db, id, at(0))).address).toMatchObject({ status: 'in_review', verified: false });
  });

  it('shows staff the queue, and opens the document only with a logged reason, for the right person, for 5 minutes', async () => {
    const page = await getAdminVerificationsPage(db, taylor, 'address', at(3));
    const queued = page.address.find((item) => item.person.id === id);
    expect(queued).toMatchObject({ documentType: 'utility_bill', areaName: 'Mueller', overdue: true });
    expect(page.canDecide).toBe(true);
    expect((await getAdminVerificationsPage(db, alex, 'address', at(3))).canDecide).toBe(false);

    const [row] = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, id));
    expect(await revealAddressProof(db, { cipher, secret }, alex, { verificationId: row!.id, reason: 'Reviewing the proof.' }, at(3))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revealAddressProof(db, { cipher, secret }, taylor, { verificationId: row!.id, reason: 'short' }, at(3))).toMatchObject({ ok: false, code: 'validation_failed' });
    const revealed = await revealAddressProof(db, { cipher, secret }, taylor, { verificationId: row!.id, reason: 'Reviewing the proof sent today.' }, at(3));
    if (!revealed.ok || !revealed.document) throw new Error('reveal failed');
    expect(revealed.address).toBe('1234 Example Lane, Apt 2, Austin, TX 78723');
    expect(revealed.document.kind).toBe('image');
    const token = revealed.document.url.split('/').pop()!;
    expect(readDocumentToken(token, secret, at(3))).toMatchObject({ staffUserId: 'usr_taylor' });
    expect(await documentForToken(db, storage, token, taylor, secret, at(3))).toMatchObject({ contentType: 'image/webp' });
    // Another staff member, a stranger, a changed token, or after 5 minutes: nothing.
    expect(await documentForToken(db, storage, token, { id: 'usr_morgan', roles: ['support_lead'] }, secret, at(3))).toBeNull();
    expect(await documentForToken(db, storage, token, null, secret, at(3))).toBeNull();
    expect(await documentForToken(db, storage, `${token}x`, taylor, secret, at(3))).toBeNull();
    expect(await documentForToken(db, storage, token, taylor, secret, new Date(at(3).getTime() + 6 * 60_000))).toBeNull();
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'address_proof.viewed'), eq(auditLog.targetId, id)));
    expect(logged).toMatchObject({ actorId: 'usr_taylor', reason: 'Reviewing the proof sent today.' });
  });

  it('turns a proof down with a reason, takes a new one, and approves it', async () => {
    const [row] = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, id));
    expect(await decideAddress(db, alex, { verificationId: row!.id, decision: 'approve', note: 'Looks fine to me.' }, at(3))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideAddress(db, taylor, { verificationId: row!.id, decision: 'reject', note: 'The bill is from last spring.' }, at(3))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'] } });
    expect(await decideAddress(db, taylor, { verificationId: row!.id, decision: 'reject', reason: 'too_old', note: 'The bill is from last spring.' }, at(3))).toEqual({ ok: true, code: 'updated' });
    expect(await decideAddress(db, taylor, { verificationId: row!.id, decision: 'approve', note: 'Second decision should fail.' }, at(3))).toEqual({ ok: false, code: 'not_allowed' });
    expect((await loadOnboardingState(db, id, at(3))).address).toMatchObject({ status: 'rejected', rejectionReason: 'too_old', canSubmit: true });

    const valid = { placeId: 'plc_mueller_1234', documentType: 'bank_statement', declaration: 'true' };
    const pdf = new File([new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF')], 'statement.pdf', { type: 'application/pdf' });
    expect(await submitAddressProof(deps, id, proofForm(valid, pdf), at(4))).toEqual({ ok: true, code: 'submitted' });
    const newest = (await db.select().from(addressVerifications).where(and(eq(addressVerifications.userId, id), eq(addressVerifications.status, 'in_review'))))[0]!;
    expect(await decideAddress(db, taylor, { verificationId: newest.id, decision: 'approve', note: 'Name and address match the statement.' }, at(4))).toEqual({ ok: true, code: 'updated' });
    const state = await loadOnboardingState(db, id, at(4));
    expect(state.address).toMatchObject({ status: 'verified', verified: true });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, id));
    expect(profile!.addressVerifiedAt).not.toBeNull();

    // The helper hears about both decisions (the dispatcher turns these into notifications).
    const events = await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, id)));
    expect(events.map((event) => event.payload)).toEqual(expect.arrayContaining([
      { userId: id, track: 'address', outcome: 'action_needed' },
      { userId: id, track: 'address', outcome: 'passed' },
    ]));
  });

  it('keeps documents after the decision for our team (owner, 2026-11-27: "save document always")', async () => {
    const before = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, id));
    const keys = await db.select({ key: files.storageKey }).from(files).where(inArray(files.id, before.map((row) => row.documentFileId).filter((value): value is string => value !== null)));
    expect(keys).toHaveLength(2);
    const result = await runVerificationTimers(db, { storage, providers }, at(40), { userIds: PEOPLE });
    expect(result.documentsDeleted).toBe(0);
    const after = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, id));
    expect(after.every((row) => row.documentFileId !== null && row.documentDeletedAt === null)).toBe(true);
    expect(after.map((row) => row.status).sort()).toEqual(['rejected', 'verified']);
    for (const { key } of keys) expect(await storage.get(key)).not.toBeNull();
    expect((await loadOnboardingState(db, id, at(35))).address.verified).toBe(true);
  });

  it('stops counting a verification when staff ask for a new proof', async () => {
    const view = await getPersonVerification(db, taylor, id, at(36));
    expect(view.actions).toContain('request_address');
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'request_address', note: 'Mail came back undeliverable.' }, at(36))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, id, at(36))).address).toMatchObject({ status: 'requested', verified: false, canSubmit: true });
  });
});

describe('ID checks', () => {
  const id = 'usr_vt_identity';

  it('needs consent, allows 3 tries a day, and sends 5 failed tries to staff', async () => {
    await helper(id);
    // The provider's check is the double check: it opens once our team approved the photos.
    expect(await startIdentity(db, providers, id, at(0), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    await photosApproved(id, at(-0.5));
    expect(await startIdentity(db, providers, id, at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    // A double check that fails after our team's approval waits for staff (6.2); here they let them try again each time.
    const fail = async (when: Date) => {
      const start = await startIdentity(db, providers, id, when, { consent: true });
      if (!start.ok) return start;
      await recordIdentityResult(db, param(start.redirectTo!, 'session'), { status: 'requires_input', reason: 'document_unreadable' }, when);
      expect((await loadOnboardingState(db, id, when)).identity).toMatchObject({ blocked: 'double_check_review', canStart: false });
      expect(await verificationAction(db, providers, taylor, { userId: id, action: 'allow_double_check_retry', note: 'Glare on the license; one more try.' }, when)).toEqual({ ok: true, code: 'updated' });
      return start;
    };
    for (const hours of [0, 1, 2]) expect((await fail(new Date(at(0).getTime() + hours * 3_600_000))).ok).toBe(true);
    const blocked = (await loadOnboardingState(db, id, new Date(at(0).getTime() + 3 * 3_600_000))).identity;
    // The approved photos are a try too, but not a failed one: 3 failed sessions today pause the check.
    expect(blocked).toMatchObject({ blocked: 'try_later', canStart: false, attempts: 4 });
    expect(await startIdentity(db, providers, id, new Date(at(0).getTime() + 3 * 3_600_000), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    expect((await fail(at(1.2))).ok).toBe(true);
    expect((await fail(at(1.3))).ok).toBe(true);
    expect((await loadOnboardingState(db, id, at(3))).identity).toMatchObject({ blocked: 'too_many_attempts', attempts: 6 });
    const queue = await getAdminVerificationsPage(db, taylor, 'identity', at(3));
    expect(queue.identity.find((row) => row.person.id === id)).toMatchObject({ kind: 'too_many_attempts', attempts: 6 });

    // Staff allow new tries: the count starts again.
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'allow_identity_retry', note: 'Glare on the license; told them to try indoors.' }, at(3))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, id, at(3))).identity).toMatchObject({ status: 'not_started', attempts: 0, canStart: true });
  });

  it('holds a verified ID whose name differs until staff confirm it', async () => {
    // New tries start again from our own photos.
    await photosApproved(id, at(3.5));
    const start = await startIdentity(db, providers, id, at(4), { consent: true });
    if (!start.ok) throw new Error('start failed');
    await recordIdentityResult(db, param(start.redirectTo!, 'session'), { status: 'verified', verifiedName: { firstName: 'Veronica', lastName: 'Smith' } }, at(4));
    expect((await loadOnboardingState(db, id, at(4))).identity).toMatchObject({ verified: true, cleared: false, nameCheck: 'in_review' });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, id));
    expect(profile!.idVerifiedAt).toBeNull();
    expect((await getPersonVerification(db, taylor, id, at(4))).actions).toContain('confirm_name');
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'confirm_name', note: 'Married name; checked with the person by phone.' }, at(4))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, id, at(4))).identity).toMatchObject({ cleared: true });
    const [after] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, id));
    expect(after!.idVerifiedAt).not.toBeNull();
  });

  it('asks the provider to delete the images 30 days after the result, and closes unfinished sessions', async () => {
    await runVerificationTimers(db, { storage, providers }, at(40), { userIds: PEOPLE });
    const rows = await db.select().from(identityVerifications).where(eq(identityVerifications.userId, id));
    expect(rows.filter((row) => row.providerSessionId !== null).every((row) => row.redactionRequestedAt !== null)).toBe(true);

    // Staff ask for a new check; it starts, and nobody finishes it.
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'request_identity', note: 'Report of a shared account; new check.' }, at(41))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, id, at(41))).identity).toMatchObject({ status: 'not_started', requested: 'staff_request', cleared: false, captureApproved: false });
    // The helper starts a little after the request: rows on one user are read in createdAt order, and two rows written at
    // the same instant could come back either way.
    await photosApproved(id, at(41.01));
    expect((await startIdentity(db, providers, id, at(41.01), { consent: true })).ok).toBe(true);
    await runVerificationTimers(db, { storage, providers }, at(42), { userIds: PEOPLE });
    expect((await loadOnboardingState(db, id, at(41.5))).identity.status).toBe('processing');
    await runVerificationTimers(db, { storage, providers }, at(43.1), { userIds: PEOPLE });
    expect((await loadOnboardingState(db, id, at(43.1))).identity).toMatchObject({ status: 'canceled', canStart: true });
  });
});

describe('background checks', () => {
  const id = 'usr_vt_background';

  it('expires an unused invitation after 7 days', async () => {
    await helper(id, { identity: true, payout: true, inHome: true });
    const first = await startBackgroundCheck(db, providers, id, at(0), { acknowledged: true });
    expect(first.ok).toBe(true);
    await runVerificationTimers(db, { storage, providers }, at(8), { userIds: PEOPLE });
    expect((await loadOnboardingState(db, id, at(8))).background).toMatchObject({ status: 'expired', canStart: true });
  });

  it("tells the provider where the helper works: their neighborhood's market, or while they wait, their home ZIP", async () => {
    const where = 'usr_vt_bg_where';
    await helper(where, { identity: true, payout: true, inHome: true });
    const seen: unknown[] = [];
    const recording = {
      ...providers,
      background: { ...providers.background, start: async (person: Parameters<typeof providers.background.start>[0]) => (seen.push(person.workLocation), providers.background.start(person)) },
    };
    expect((await startBackgroundCheck(db, recording, where, at(0), { acknowledged: true })).ok).toBe(true);
    // Waiting for their city in Florida (a ZIP instead of a neighborhood): Florida's rules, not Austin's.
    await db.update(helperProfiles).set({ areaId: null, homeZip: '32601', homeCity: 'Gainesville', homeState: 'FL' }).where(eq(helperProfiles.userId, where));
    await runVerificationTimers(db, { storage, providers }, at(8), { userIds: [where] });
    expect((await startBackgroundCheck(db, recording, where, at(9), { acknowledged: true })).ok).toBe(true);
    // Neither a neighborhood nor a ZIP: no check without knowing where.
    await runVerificationTimers(db, { storage, providers }, at(17), { userIds: [where] });
    await db.update(helperProfiles).set({ homeZip: null, homeCity: null, homeState: null }).where(eq(helperProfiles.userId, where));
    expect(await startBackgroundCheck(db, recording, where, at(18), { acknowledged: true })).toEqual({ ok: false, code: 'not_allowed' });
    expect(seen).toEqual([
      { state: 'TX', city: 'Austin' },
      { state: 'FL', city: 'Gainesville' },
    ]);
  });

  it('adjudicates a consider result: pre-adverse, then final only after the dispute window', async () => {
    const start = await startBackgroundCheck(db, providers, id, at(9), { acknowledged: true });
    if (!start.ok) throw new Error('start failed');
    await recordBackgroundResult(db, param(start.redirectTo!, 'check'), 'consider', at(12));
    expect((await loadOnboardingState(db, id, at(12))).background).toMatchObject({ status: 'consider', eligible: false, canStart: false });
    expect((await getAdminVerificationsPage(db, taylor, 'background', at(12))).background.find((row) => row.person.id === id)).toBeDefined();
    // Adjudication is trust and safety's alone (blueprint 08's permission matrix): a support lead or an admin is refused.
    for (const other of [morgan, riley]) {
      expect((await getPersonVerification(db, other, id, at(12))).actions).not.toEqual(expect.arrayContaining(['engage_background']));
      for (const action of ['pre_adverse_background', 'engage_background'] as const) {
        expect(await verificationAction(db, providers, other, { userId: id, action, note: 'Not my call to make, by the matrix.' }, at(12))).toEqual({ ok: false, code: 'not_allowed' });
      }
    }
    expect((await getPersonVerification(db, taylor, id, at(12))).actions).toEqual(expect.arrayContaining(['engage_background', 'pre_adverse_background']));
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'post_adverse_background', note: 'Trying to finalize too early.' }, at(12))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'pre_adverse_background', note: 'Report has a recent relevant record.' }, at(12))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, id, at(12))).background).toMatchObject({ adjudication: 'pre_adverse', disputeUntil: at(19) });
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'post_adverse_background', note: 'Still inside the dispute window.' }, at(15))).toEqual({ ok: false, code: 'not_allowed' });
    // Past the dispute window, the final notice is still trust and safety's.
    expect(await verificationAction(db, providers, morgan, { userId: id, action: 'post_adverse_background', note: 'Past the window; finalizing.' }, at(20))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await verificationAction(db, providers, riley, { userId: id, action: 'post_adverse_background', note: 'Past the window; finalizing.' }, at(20))).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getPersonVerification(db, taylor, id, at(20))).actions).toContain('post_adverse_background');
    // The person disputed and Checkr corrected the record: staff approve instead.
    expect(await verificationAction(db, providers, taylor, { userId: id, action: 'engage_background', note: 'Checkr corrected the record after the dispute.' }, at(20))).toEqual({ ok: true, code: 'updated' });
    const state = await loadOnboardingState(db, id, at(20));
    expect(state.background).toMatchObject({ eligible: true, adjudication: 'engaged' });
    expect(state.background.badgeAt).toBeUndefined();
  });

  it('sends renewal notices at 30 and 7 days and pauses in-home work when it runs out', async () => {
    // Approved after review: it counts until 365 days after completion (day 12).
    const [row] = await db.select().from(backgroundChecks).where(and(eq(backgroundChecks.userId, id), eq(backgroundChecks.adjudication, 'engaged')));
    expect(row!.expiresAt).toEqual(at(377));
    await runVerificationTimers(db, { storage, providers }, at(347), { userIds: PEOPLE });
    await runVerificationTimers(db, { storage, providers }, at(371), { userIds: PEOPLE });
    await runVerificationTimers(db, { storage, providers }, at(371.5), { userIds: PEOPLE });
    await runVerificationTimers(db, { storage, providers }, at(378), { userIds: PEOPLE });
    expect((await loadOnboardingState(db, id, at(378))).background).toMatchObject({ status: 'expired', eligible: false, canStart: true });
    const events = await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, id)));
    const notices = events.map((event) => event.payload).filter((payload) => payload.track === 'background' && (payload.outcome === 'expiring' || payload.outcome === 'expired'));
    // One of each, whatever order the rows come back in.
    expect(notices).toHaveLength(3);
    expect(notices).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: 'expiring', days: 30 }),
      expect.objectContaining({ outcome: 'expiring', days: 6 }),
      expect.objectContaining({ outcome: 'expired', days: 0 }),
    ]));
  });
});
