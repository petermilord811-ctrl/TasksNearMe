import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiUnavailableError } from '@/integrations/ai';
import type { IdDocumentReader } from '@/integrations/ai/id-document-reader';
import { createLocalFileStorage } from '@/integrations/storage';
import { recordAgreement } from '@/modules/accounts/agreements';
import { agreements, users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { files } from '@/modules/tasks/schema';
import { canViewFile } from '@/modules/files/access';
import { readPendingDocuments, readPendingIds } from '@/modules/verification/auto-check';
import { acceptIdentityNotice, submitIdentityCapture } from '@/modules/verification/capture';
import { createDevVerificationProviders } from '@/modules/verification/providers';
import { identityCaptures } from '@/modules/verification/schema';
import { decideIdentityCapture, documentForToken, getAdminVerificationsPage, getPersonVerification, revealIdentityCapture, verificationAction } from '@/modules/verification/staff';
import { livenessPromptFor } from '@/modules/verification/standing';
import { captureSummary, loadOnboardingState } from '@/modules/verification/state';
import { computeOnboarding } from '@/modules/verification/progress';
import { runVerificationTimers } from '@/modules/verification/timers';
import { recordIdentityResult, startIdentity } from '@/modules/verification/tracks';
import { auditLog } from '@/platform/audit/schema';
import { createByteCipher, createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Our own ID check, the first of two stages (completion plan 6.1): the Texas notice first, photos stored
 * re-encoded and encrypted, the automatic reading that keeps only answers, staff review with logged
 * 5-minute links, the attempt limits shared with the provider's check, the double check after approval,
 * and deletion 30 days after the decision.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const MINUTE = 60_000;
const root = path.join(os.tmpdir(), `tnm-identity-capture-${process.pid}`);
const storage = createLocalFileStorage(root);
const fileCipher = createByteCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const secret = 'test-secret-for-document-links-0123456789';
const deps = { db, storage, files: fileCipher, secret };
const providers = createDevVerificationProviders();
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const morgan = { id: 'usr_morgan', roles: ['support_lead' as const] };
const alex = { id: 'usr_alex', roles: ['support_agent' as const] };
const MAIN = 'usr_ic_main';
const LIMITS = 'usr_ic_limits';
const MINOR = 'usr_ic_minor';
const READER = 'usr_ic_reader';
const GONE = 'usr_ic_gone';
const PEOPLE = [MAIN, LIMITS, MINOR, READER, GONE];
const t0 = new Date('2026-11-20T16:00:00.000Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';

/** A helper up to the ID step: the basics, the agreement and a verified phone. */
async function helper(id: string, email = `${id}@example.test`) {
  await db.insert(users).values({ id, email, name: 'Vera T.', firstName: 'Vera', lastName: 'Tester', phone: `+1512555${String(PEOPLE.indexOf(id)).padStart(2, '0')}77`, phoneVerifiedAt: at(-30), createdAt: at(-30) });
  await db.insert(helperProfiles).values({ userId: id, handle: id.replace(/_/g, '-'), headline: 'Careful help around the house', bio: 'I help neighbors with careful work and always leave the place tidy. References on request.', languages: ['en'], status: 'draft', areaId: 'area_mueller' });
  const [yard] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'yard-cleanup'));
  await db.insert(helperServices).values({ id: `svc_${id}`, userId: id, categoryId: yard!.id, pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '', status: 'active' });
  await recordAgreement(db, id, 'helper_agreement', {}, at(-30));
}

/** A camera photo as it arrives: a JPEG carrying a name and a location in its metadata. */
async function photo(name = 'photo.jpg', width = 1200, height = 800) {
  const body = await sharp({ create: { width, height, channels: 3, background: '#d9c7b2' } })
    .withMetadata({ exif: { IFD0: { Artist: 'Secret Person', Copyright: 'GPS 30.2985,-97.7042' } } })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(body)], name, { type: 'image/jpeg' });
}

async function captureForm(documentType: string, kinds: readonly string[] = ['front', 'back', 'selfie']) {
  const form = new FormData();
  form.set('documentType', documentType);
  for (const kind of kinds) form.set(kind, await photo(`${kind}.jpg`));
  return form;
}

async function capturesOf(userId: string) {
  return db.select().from(identityCaptures).where(eq(identityCaptures.userId, userId)).orderBy(identityCaptures.createdAt);
}

/** Sends photos and has staff decide them (`reason` rejects). */
async function tryOnce(userId: string, when: Date, reason?: 'document_unreadable' | 'selfie_mismatch' | 'prompt_not_followed' | 'under_18' | 'expired') {
  expect(await submitIdentityCapture(deps, userId, await captureForm('state_id'), when)).toEqual({ ok: true, code: 'submitted' });
  const latest = (await capturesOf(userId)).at(-1)!;
  const decision = reason ? { decision: 'reject' as const, reason } : { decision: 'approve' as const };
  expect(await decideIdentityCapture(db, taylor, { captureId: latest.id, ...decision, note: 'Compared the ID and the selfie.' }, when)).toEqual({ ok: true, code: 'updated' });
}

beforeAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterAll(async () => {
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await pool.end();
  await fs.rm(root, { recursive: true, force: true });
});

describe('sending the photos', () => {
  it('needs the Texas notice first, recorded in its new version', async () => {
    await helper(MAIN);
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('drivers_license'), at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    expect(await acceptIdentityNotice(db, MAIN, { consent: false }, at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    expect(await acceptIdentityNotice(db, MAIN, { consent: true }, at(0), { ip: '203.0.113.9', userAgent: 'test' })).toEqual({ ok: true, code: 'updated' });
    const [consent] = await db.select().from(agreements).where(and(eq(agreements.userId, MAIN), eq(agreements.doc, 'biometric_consent')));
    expect(consent).toMatchObject({ version: 'draft-0.2', ip: '203.0.113.9' });
  });

  it('checks the kind of ID and every photo', async () => {
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('library_card'), at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { documentType: ['required'] } });
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('drivers_license', ['front', 'selfie']), at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { back: ['required'] } });
    const text = await captureForm('passport', ['selfie']);
    text.set('front', new File([new TextEncoder().encode('hello')], 'id.txt', { type: 'text/plain' }));
    expect(await submitIdentityCapture(deps, MAIN, text, at(0))).toEqual({ ok: false, code: 'unsupported_type' });
    const fake = await captureForm('passport', ['front']);
    fake.set('selfie', new File([new TextEncoder().encode('<svg onload="alert(1)">')], 'selfie.jpg', { type: 'image/jpeg' }));
    expect(await submitIdentityCapture(deps, MAIN, fake, at(0))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { selfie: ['invalid'] } });
    const huge = await captureForm('passport', ['selfie']);
    huge.set('front', new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'front.jpg', { type: 'image/jpeg' }));
    expect(await submitIdentityCapture(deps, MAIN, huge, at(0))).toEqual({ ok: false, code: 'too_large' });
    expect(await capturesOf(MAIN)).toHaveLength(0);
  });

  it('stores the photos re-encoded and encrypted, private even from their owner, and waits for review', async () => {
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('drivers_license'), at(0))).toEqual({ ok: true, code: 'submitted' });
    const [row] = await capturesOf(MAIN);
    expect(row).toMatchObject({ status: 'submitted', documentType: 'drivers_license', promptKey: livenessPromptFor(MAIN, 0, secret), submittedAt: at(0) });
    const stored = await db.select().from(files).where(inArray(files.id, [row!.frontFileId!, row!.backFileId!, row!.selfieFileId!]));
    expect(stored.map((file) => file.kind).sort()).toEqual(['id_document', 'id_document', 'id_selfie']);
    for (const file of stored) {
      expect(file).toMatchObject({ ownerUserId: MAIN, contentType: 'image/webp' });
      const sealed = (await storage.get(file.storageKey))!;
      // Encrypted at rest: no image header, no metadata, nothing readable.
      expect(sealed.subarray(0, 4).toString('latin1')).toBe('TNF1');
      expect(sealed.includes(Buffer.from('WEBP'))).toBe(false);
      expect(sealed.toString('latin1')).not.toContain('Secret Person');
      const opened = fileCipher.decrypt(sealed);
      expect(opened.subarray(8, 12).toString('latin1')).toBe('WEBP');
      const metadata = await sharp(opened).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(opened.toString('latin1')).not.toContain('Secret Person');
      // Never through the general file route, for anyone.
      expect(canViewFile(file, { userId: MAIN, isStaff: false })).toBe(false);
      expect(canViewFile(file, { userId: 'usr_taylor', isStaff: true })).toBe(false);
    }
    // One set in review at a time; the provider's double check waits for the approval.
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('drivers_license'), at(0.01))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await startIdentity(db, providers, MAIN, at(0.01))).toEqual({ ok: false, code: 'not_allowed' });
    const state = await loadOnboardingState(db, MAIN, at(0.01));
    expect(captureSummary(state, secret)).toMatchObject({ stage: 'in_review', canSubmit: false, documentType: 'drivers_license' });
    expect(computeOnboarding(state.facts).progress.steps.find((step) => step.step === 'identity')?.state).toBe('in_review');
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'identity_capture.submitted'), eq(auditLog.targetId, MAIN)));
    expect(audit?.metadata).toEqual({ captureId: row!.id, documentType: 'drivers_license' });
  });

  it('keeps one set in review even when two sends race', async () => {
    await helper(GONE);
    await acceptIdentityNotice(db, GONE, { consent: true }, at(0));
    const [first, second] = await Promise.all([
      submitIdentityCapture(deps, GONE, await captureForm('passport', ['front', 'selfie']), at(0)),
      submitIdentityCapture(deps, GONE, await captureForm('passport', ['front', 'selfie']), at(0)),
    ]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toEqual([{ ok: false, code: 'not_allowed' }]);
    const rows = await capturesOf(GONE);
    expect(rows).toHaveLength(1);
    // The losing send's photos went with it.
    expect(await db.select().from(files).where(eq(files.ownerUserId, GONE))).toHaveLength(2);
  });
});

describe('the automatic reading', () => {
  const full = { readable: true, givenNames: 'VERA LYNN', surname: 'TESTER', dateOfBirth: '1990-04-02', expiryDate: '2029-04-02', documentType: 'drivers_license' as const, issuingState: 'TX' };
  const stub = (read: IdDocumentReader['read']): IdDocumentReader => ({ name: 'stub', read: vi.fn(read) });

  it('reads the front once and keeps only answers, never the name, birth date or state', async () => {
    await helper(READER, 'ic-reader@qa.tasksnearme-test.net');
    await acceptIdentityNotice(db, READER, { consent: true }, at(0));
    expect(await submitIdentityCapture(deps, READER, await captureForm('drivers_license'), at(0))).toEqual({ ok: true, code: 'submitted' });
    const reader = stub(async () => full);
    const scope = { userIds: [MAIN, READER] };
    expect(await readPendingDocuments(db, { storage, cipher, reader: null, identity: { storage, files: fileCipher, reader } }, at(0.1), scope)).toEqual({ read: 2 });
    // The test account (example.test) got the stand-in; the other the configured reader, with the front only.
    expect(reader.read).toHaveBeenCalledTimes(1);
    const input = vi.mocked(reader.read).mock.calls[0]![0];
    expect(input.declaredType).toBe('drivers_license');
    expect(input.document.contentType).toBe('image/webp');
    expect(input.document.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    const [read] = await capturesOf(READER);
    expect(read!.autoCheck).toEqual({ readable: true, nameMatches: true, isAdult: true, notExpired: true, expiresMonth: 4, expiresYear: 2029, documentType: 'drivers_license', by: 'stub', at: at(0.1).toISOString() });
    expect(JSON.stringify(read!.autoCheck)).not.toMatch(/VERA|TESTER|1990|TX/);
    const [main] = await capturesOf(MAIN);
    expect(main!.autoCheck).toEqual({ readable: true, documentType: 'drivers_license', by: 'stand-in', at: at(0.1).toISOString() });
    expect(await readPendingIds(db, { storage, files: fileCipher, reader }, at(0.2), scope)).toBe(0);
  });

  it("leaves it to staff when the reader can't answer, and does nothing without a reader", async () => {
    await db.update(identityCaptures).set({ autoCheck: null }).where(eq(identityCaptures.userId, READER));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readPendingIds(db, { storage, files: fileCipher, reader: null }, at(0.2), { userIds: [READER] })).toBe(0);
    expect(await readPendingIds(db, { storage, files: fileCipher, reader: stub(async () => { throw new AiUnavailableError('down'); }) }, at(0.2), { userIds: [READER] })).toBe(1);
    quiet.mockRestore();
    expect((await capturesOf(READER))[0]!.autoCheck).toEqual({ readable: false, by: 'stub (unavailable)', at: at(0.2).toISOString() });
  });
});

describe('staff review', () => {
  it('queues the photos oldest first, and shows what was sent with the reading', async () => {
    const page = await getAdminVerificationsPage(db, taylor, 'identity', at(0.5));
    const queued = page.identity.find((row) => row.person.id === MAIN);
    expect(queued).toMatchObject({ kind: 'capture', attempts: 1, at: at(0).toISOString(), capture: { documentType: 'drivers_license', autoCheck: { readable: true, documentType: 'drivers_license' }, overdue: false } });
    expect((await getAdminVerificationsPage(db, taylor, 'identity', at(3))).identity.find((row) => row.person.id === MAIN)?.capture?.overdue).toBe(true);
    const view = await getPersonVerification(db, taylor, MAIN, at(0.5));
    expect(view.identity.captures).toEqual([expect.objectContaining({ status: 'submitted', documentType: 'drivers_license', prompt: livenessPromptFor(MAIN, 0, secret), photos: ['front', 'back', 'selfie'] })]);
    expect(view.actions).toEqual(expect.arrayContaining(['review_identity_capture', 'view_identity_photos']));
    expect((await getPersonVerification(db, alex, MAIN, at(0.5))).actions).toEqual([]);
  });

  it('opens the photos only with a logged reason, for that staff member, for 5 minutes', async () => {
    const [row] = await capturesOf(MAIN);
    expect(await revealIdentityCapture(db, { secret }, alex, { captureId: row!.id, reason: 'Comparing the photos.' }, at(0.5))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revealIdentityCapture(db, { secret }, taylor, { captureId: row!.id, reason: 'short' }, at(0.5))).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await revealIdentityCapture(db, { secret }, taylor, { captureId: 'idc_nobody', reason: 'Comparing the photos sent today.' }, at(0.5))).toEqual({ ok: false, code: 'not_found' });
    const revealed = await revealIdentityCapture(db, { secret }, taylor, { captureId: row!.id, reason: 'Comparing the photos sent today.' }, at(0.5));
    if (!revealed.ok) throw new Error('reveal failed');
    expect(revealed.photos.map((item) => item.kind)).toEqual(['front', 'back', 'selfie']);
    expect(revealed).toMatchObject({ prompt: row!.promptKey, expiresAt: new Date(at(0.5).getTime() + 5 * MINUTE).toISOString() });
    const token = revealed.photos[2]!.url.split('/').pop()!;
    const selfie = await documentForToken(db, storage, token, taylor, secret, at(0.5), fileCipher);
    expect(selfie?.contentType).toBe('image/webp');
    expect(selfie!.body.subarray(8, 12).toString('latin1')).toBe('WEBP');
    // Without the key, for someone else, changed, or after 5 minutes: nothing.
    expect(await documentForToken(db, storage, token, taylor, secret, at(0.5))).toBeNull();
    expect(await documentForToken(db, storage, token, morgan, secret, at(0.5), fileCipher)).toBeNull();
    expect(await documentForToken(db, storage, token, null, secret, at(0.5), fileCipher)).toBeNull();
    expect(await documentForToken(db, storage, `${token}x`, taylor, secret, at(0.5), fileCipher)).toBeNull();
    expect(await documentForToken(db, storage, token, taylor, secret, new Date(at(0.5).getTime() + 6 * MINUTE), fileCipher)).toBeNull();
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'identity_capture.viewed'), eq(auditLog.targetId, MAIN)));
    expect(logged).toMatchObject({ actorId: 'usr_taylor', reason: 'Comparing the photos sent today.', metadata: { captureId: row!.id, photos: 3 } });
  });

  it('turns photos down with a reason the helper sees, then takes new ones with a new prompt', async () => {
    const [row] = await capturesOf(MAIN);
    expect(await decideIdentityCapture(db, alex, { captureId: row!.id, decision: 'approve', note: 'Looks fine to me.' }, at(1))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideIdentityCapture(db, taylor, { captureId: row!.id, decision: 'reject', note: 'The selfie shows no turn.' }, at(1))).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'] } });
    expect(await decideIdentityCapture(db, taylor, { captureId: row!.id, decision: 'reject', reason: 'prompt_not_followed', note: 'The selfie shows no turn.' }, at(1))).toEqual({ ok: true, code: 'updated' });
    expect(await decideIdentityCapture(db, taylor, { captureId: row!.id, decision: 'approve', note: 'A second decision fails.' }, at(1))).toEqual({ ok: false, code: 'not_allowed' });
    const [decided] = await capturesOf(MAIN);
    expect(decided).toMatchObject({ status: 'rejected', rejectionReason: 'prompt_not_followed', decidedByUserId: 'usr_taylor', staffNote: 'The selfie shows no turn.', decidedAt: at(1) });
    const state = await loadOnboardingState(db, MAIN, at(1));
    expect(captureSummary(state, secret)).toEqual({ stage: 'needed', canSubmit: true, documentType: 'drivers_license', submittedAt: at(0).toISOString(), rejectionReason: 'prompt_not_followed', prompt: livenessPromptFor(MAIN, 1, secret) });
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('passport', ['front', 'selfie']), at(1.1))).toEqual({ ok: true, code: 'submitted' });
    expect((await capturesOf(MAIN))[1]).toMatchObject({ documentType: 'passport', backFileId: null, promptKey: livenessPromptFor(MAIN, 1, secret) });
  });

  it('approves the new photos, opens the double check, and the provider verifies the ID', async () => {
    const latest = (await capturesOf(MAIN))[1]!;
    expect(await decideIdentityCapture(db, taylor, { captureId: latest.id, decision: 'approve', note: 'Passport and selfie match; looked left as asked.' }, at(1.2))).toEqual({ ok: true, code: 'updated' });
    expect(captureSummary(await loadOnboardingState(db, MAIN, at(1.2)), secret)).toMatchObject({ stage: 'approved', canSubmit: false });
    expect(await submitIdentityCapture(deps, MAIN, await captureForm('passport', ['front', 'selfie']), at(1.2))).toEqual({ ok: false, code: 'not_allowed' });
    // The notice was accepted before the photos, so the double check opens without asking again.
    const start = await startIdentity(db, providers, MAIN, at(1.2));
    if (!start.ok) throw new Error('the double check did not start');
    await recordIdentityResult(db, param(start.redirectTo!, 'session'), { status: 'verified', verifiedName: { firstName: 'Vera', lastName: 'Tester' } }, at(1.25));
    const state = await loadOnboardingState(db, MAIN, at(1.25));
    expect(state.identity).toMatchObject({ verified: true, cleared: true, attempts: 3 });
    expect(captureSummary(state, secret).stage).toBe('done');
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, MAIN));
    expect(profile!.idVerifiedAt).not.toBeNull();
    const events = await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, MAIN)));
    expect(events.map((event) => event.payload)).toEqual(expect.arrayContaining([
      { userId: MAIN, track: 'identity', outcome: 'action_needed' },
      { userId: MAIN, track: 'identity', outcome: 'passed' },
    ]));
    const decisions = await db.select({ action: auditLog.action, reason: auditLog.reason }).from(auditLog).where(and(inArray(auditLog.action, ['identity_capture.approved', 'identity_capture.rejected']), eq(auditLog.targetId, MAIN)));
    expect(decisions).toEqual(expect.arrayContaining([
      { action: 'identity_capture.rejected', reason: 'The selfie shows no turn.' },
      { action: 'identity_capture.approved', reason: 'Passport and selfie match; looked left as asked.' },
    ]));
  });
});

describe('the limits', () => {
  it('counts photos toward the ID limits: 3 a day, then 5 in all goes to staff', async () => {
    await helper(LIMITS);
    await acceptIdentityNotice(db, LIMITS, { consent: true }, at(0));
    for (const hours of [0, 1, 2]) await tryOnce(LIMITS, new Date(at(0).getTime() + hours * 3_600_000), 'document_unreadable');
    expect((await loadOnboardingState(db, LIMITS, at(0.2))).identity).toMatchObject({ blocked: 'try_later', canCapture: false, attempts: 3 });
    expect(await submitIdentityCapture(deps, LIMITS, await captureForm('state_id'), at(0.2))).toEqual({ ok: false, code: 'not_allowed' });
    await tryOnce(LIMITS, at(1.1), 'selfie_mismatch');
    await tryOnce(LIMITS, at(1.2), 'expired');
    expect((await loadOnboardingState(db, LIMITS, at(1.3))).identity).toMatchObject({ blocked: 'too_many_attempts', attempts: 5 });
    const queued = (await getAdminVerificationsPage(db, taylor, 'identity', at(1.3))).identity.find((row) => row.person.id === LIMITS);
    expect(queued).toMatchObject({ kind: 'too_many_attempts', attempts: 5 });
    expect(await verificationAction(db, providers, taylor, { userId: LIMITS, action: 'allow_identity_retry', note: 'Glare every time; explained how to avoid it.' }, at(1.3))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, LIMITS, at(1.3))).identity).toMatchObject({ canCapture: true, attempts: 0 });
  });

  it('closes helper setup when staff find the person is under 18, until they reopen it', async () => {
    await helper(MINOR);
    await acceptIdentityNotice(db, MINOR, { consent: true }, at(0));
    await tryOnce(MINOR, at(0), 'under_18');
    const state = await loadOnboardingState(db, MINOR, at(0.1));
    expect(state.identity).toMatchObject({ blocked: 'under_18', canCapture: false, canStart: false });
    expect(captureSummary(state, secret)).toMatchObject({ stage: 'needed', canSubmit: false, rejectionReason: 'under_18' });
    expect(await submitIdentityCapture(deps, MINOR, await captureForm('state_id'), at(0.1))).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getPersonVerification(db, taylor, MINOR, at(0.1))).actions).toContain('allow_identity_retry');
    expect(await verificationAction(db, providers, taylor, { userId: MINOR, action: 'allow_identity_retry', note: 'The birth year was misread; checked it again.' }, at(0.2))).toEqual({ ok: true, code: 'updated' });
    expect((await loadOnboardingState(db, MINOR, at(0.2))).identity).toMatchObject({ canCapture: true });
  });
});

describe('deleting the photos', () => {
  it('deletes them 30 days after the decision, rejected ones too, keeping the status and answers', async () => {
    const before = await capturesOf(MAIN);
    const keys = await db.select({ key: files.storageKey }).from(files).where(and(eq(files.ownerUserId, MAIN), inArray(files.kind, ['id_document', 'id_selfie'])));
    expect(keys).toHaveLength(5);
    const old = await revealIdentityCapture(db, { secret }, taylor, { captureId: before[0]!.id, reason: 'Looking again before deletion.' }, at(20));
    if (!old.ok) throw new Error('reveal failed');
    await runVerificationTimers(db, { storage, providers }, at(20), { userIds: PEOPLE });
    expect((await capturesOf(MAIN)).every((row) => row.filesDeletedAt === null)).toBe(true);
    // The first photos were decided on day 1, the second on day 1.2: both are due by day 31.3.
    const result = await runVerificationTimers(db, { storage, providers }, at(31.3), { userIds: [MAIN] });
    expect(result.idPhotosDeleted).toBe(2);
    const after = await capturesOf(MAIN);
    expect(after.map((row) => row.status)).toEqual(['rejected', 'approved']);
    expect(after.every((row) => row.frontFileId === null && row.backFileId === null && row.selfieFileId === null && row.filesDeletedAt !== null)).toBe(true);
    expect(after[0]!.autoCheck).not.toBeNull();
    for (const { key } of keys) expect(await storage.get(key)).toBeNull();
    expect(await db.select().from(files).where(and(eq(files.ownerUserId, MAIN), inArray(files.kind, ['id_document', 'id_selfie'])))).toHaveLength(0);
    // Links made before stop working, the record stays, and the ID stays verified.
    expect(await documentForToken(db, storage, old.photos[0]!.url.split('/').pop()!, taylor, secret, at(20), fileCipher)).toBeNull();
    const view = await getPersonVerification(db, taylor, MAIN, at(31.3));
    expect(view.identity.captures.every((capture) => capture.photos.length === 0 && capture.photosDeletedAt)).toBe(true);
    expect(view.actions).not.toContain('view_identity_photos');
    expect((await loadOnboardingState(db, MAIN, at(31.3))).identity.cleared).toBe(true);
    const [deleted] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'identity_capture.deleted'), eq(auditLog.targetId, MAIN)));
    expect(deleted?.actorRole).toBe('system');
  });

  it("deletes a deleted account's photos at once, canceling any still in review", async () => {
    const [waiting] = await capturesOf(GONE);
    expect(waiting!.status).toBe('submitted');
    await db.update(users).set({ status: 'deleted' }).where(eq(users.id, GONE));
    const result = await runVerificationTimers(db, { storage, providers }, at(0.5), { userIds: [GONE] });
    expect(result.idPhotosDeleted).toBe(1);
    const [gone] = await capturesOf(GONE);
    expect(gone).toMatchObject({ status: 'canceled', frontFileId: null, selfieFileId: null });
    expect(gone!.filesDeletedAt).toEqual(at(0.5));
    expect(await db.select().from(files).where(eq(files.ownerUserId, GONE))).toHaveLength(0);
  });
});
