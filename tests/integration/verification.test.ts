import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createHelperServicesSchema } from '@/contracts';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { createLocalFileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { canViewFile } from '@/modules/files/access';
import { helperProfiles, helperWorkSamples } from '@/modules/profiles/schema';
import { files } from '@/modules/tasks/schema';
import { submitAddressProof } from '@/modules/verification/address';
import { acceptIdentityNotice, submitIdentityCapture } from '@/modules/verification/capture';
import {
  addWorkSample,
  createDevVerificationProviders,
  getOnboardingPageData,
  getProfileEditorData,
  recordBackgroundResult,
  recordIdentityResult,
  recordPayoutStatus,
  removeWorkSample,
  reorderWorkSamples,
  saveHelperArea,
  saveHelperProfile,
  saveHelperServices,
  setHelperPaused,
  startBackgroundCheck,
  startIdentity,
  startPayout,
} from '@/modules/verification/service';
import { addressVerifications, identityCaptures } from '@/modules/verification/schema';
import { decideAddress, decideIdentityCapture } from '@/modules/verification/staff';
import { createByteCipher, createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { auditLog } from '@/platform/audit/schema';
import { outboxEvents } from '@/platform/outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const providers = createDevVerificationProviders();
const now = () => new Date();
const userId = 'usr_onboarding';
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';
const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-onboarding-${process.pid}`));
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');
const captureDeps = { db, storage, files: createByteCipher(process.env.FIELD_ENCRYPTION_KEY ?? ''), secret: 'test-secret-for-the-selfie-prompt' };

async function profile() {
  const [row] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId));
  return row!;
}

/** Our own ID check's photos: a passport's photo page and a selfie. */
async function idPhotos() {
  const form = new FormData();
  form.set('documentType', 'passport');
  for (const kind of ['front', 'selfie']) form.set(kind, new File([new Uint8Array(await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#eef4fb' } }).jpeg().toBuffer())], `${kind}.jpg`, { type: 'image/jpeg' }));
  return form;
}

async function bill() {
  return new File([new Uint8Array(await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#ffffff' } }).jpeg().toBuffer())], 'bill.jpg', { type: 'image/jpeg' });
}

describe('helper onboarding', () => {
  it('runs from profile to bookable to complete', async () => {
    await db.insert(users).values({ id: userId, email: 'onboarding@example.test', name: 'Sam K.', firstName: 'Sam', lastName: 'Kline', homeMarketId: 'mkt_austin' });

    // Profile: a unique handle (Sam Kim already has "sam-k"); onboarding needs the helper agreement.
    const input = { headline: 'Careful cleaning and yard help', bio: 'I clean homes and tidy yards carefully, and I always leave things better than I found them.', languages: ['en' as const, 'es' as const] };
    expect(await saveHelperProfile(db, userId, input, now(), { requireAgreement: true })).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { acceptHelperAgreement: ['must_accept'] },
    });
    expect(await saveHelperProfile(db, userId, { ...input, acceptHelperAgreement: true }, now(), { requireAgreement: true })).toEqual({ ok: true, code: 'saved' });
    expect(await profile()).toMatchObject({ handle: 'sam-k-2', status: 'draft' });
    // Saved again later, the agreement is already there.
    expect(await saveHelperProfile(db, userId, input, now(), { requireAgreement: true })).toEqual({ ok: true, code: 'saved' });

    // Services are checked against category minimums.
    const tooCheap = await saveHelperServices(db, userId, { services: [{ categorySlug: 'light-cleaning', pricingType: 'fixed', fromPriceCents: 5000, description: '' }] }, now());
    expect(tooCheap).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { 'services.0.fromPriceCents': ['out_of_range'] } });
    expect(
      await saveHelperServices(
        db,
        userId,
        {
          services: [
            { categorySlug: 'light-cleaning', pricingType: 'fixed', fromPriceCents: 9000, description: 'Kitchens and baths.' },
            { categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: 'Leaves.' },
          ],
        },
        now(),
      ),
    ).toEqual({ ok: true, code: 'saved' });

    // Any order (owner, 2026-11-27): payouts, the ID and the home address are open before the area is set.
    const open = Object.fromEntries((await getOnboardingPageData(db, userId, 'done', now()))?.progress.steps.map((s) => [s.step, s.state]) ?? []);
    expect(open).toMatchObject({ address: 'todo', identity: 'todo', payout: 'todo' });
    expect(await saveHelperArea(db, userId, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false }, now())).toEqual({ ok: true, code: 'saved' });

    // The ID check waits for a verified phone.
    expect(await startIdentity(db, providers, userId, now(), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(users).set({ phone: '+15125550391', phoneVerifiedAt: now() }).where(eq(users.id, userId));
    expect((await getOnboardingPageData(db, userId, 'phone', now()))?.verification.phone).toEqual({ verified: true, last4: '0391' });

    // ID check in two stages: the Texas biometric notice, our own photos (staff approve them), then the
    // provider's double check reports verified.
    expect(await submitIdentityCapture(captureDeps, userId, await idPhotos(), now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    expect(await acceptIdentityNotice(db, userId, { consent: true }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await submitIdentityCapture(captureDeps, userId, await idPhotos(), now())).toEqual({ ok: true, code: 'submitted' });
    expect(await startIdentity(db, providers, userId, now())).toEqual({ ok: false, code: 'not_allowed' });
    const [photos] = await db.select({ id: identityCaptures.id }).from(identityCaptures).where(eq(identityCaptures.userId, userId));
    expect(await decideIdentityCapture(db, taylor, { captureId: photos!.id, decision: 'approve', note: 'The selfie matches the passport photo.' }, now(), { doubleCheck: true })).toEqual({ ok: true, code: 'updated' });
    expect((await getOnboardingPageData(db, userId, 'identity', now()))?.verification.identity.capture).toMatchObject({ stage: 'approved', canSubmit: false });
    const identity = await startIdentity(db, providers, userId, now());
    expect(identity).toMatchObject({ ok: true, redirectTo: expect.stringContaining('/dev/providers/identity?session=') });
    expect(await recordIdentityResult(db, param(identity.ok ? identity.redirectTo! : '', 'session'), { status: 'verified' }, now())).toBe(userId);
    expect((await profile()).idVerifiedAt).not.toBeNull();

    // Home address: a proof in review doesn't make the helper bookable yet.
    const form = new FormData();
    form.set('placeId', 'plc_mueller_1234');
    form.set('documentType', 'utility_bill');
    form.set('declaration', 'true');
    form.set('file', await bill());
    expect(await submitAddressProof({ db, storage, geocoder: createFakeGeocoder(), cipher }, userId, form, now())).toEqual({ ok: true, code: 'submitted' });

    // Payouts: active. Still not bookable while the address is in review.
    expect(await startPayout(db, providers, userId, now())).toMatchObject({ ok: true, redirectTo: '/dev/providers/payout' });
    await recordPayoutStatus(db, userId, 'active', now());
    expect((await getOnboardingPageData(db, userId, 'background', now()))?.progress.bookable).toBe(false);

    // Staff approve the address: yard work is bookable; cleaning waits for the background check.
    const pending = await getOnboardingPageData(db, userId, 'address', now());
    expect(pending?.verification.address).toMatchObject({ status: 'in_review', label: '1234 Example Lane, Austin, TX 78723', documentType: 'utility_bill' });
    const [proof] = await db.select({ id: addressVerifications.id }).from(addressVerifications).where(eq(addressVerifications.userId, userId));
    expect(await decideAddress(db, taylor, { verificationId: proof!.id, decision: 'approve', note: 'Name, address and date match the bill.' }, now())).toEqual({ ok: true, code: 'updated' });
    const midway = await getOnboardingPageData(db, userId, 'background', now());
    expect(midway?.progress.bookableCategories).toEqual(['yard-cleanup']);
    expect(midway?.verification.background).toMatchObject({ status: 'not_started', requiredFor: ['light-cleaning'], disclosureNeeded: true, canStart: true });
    expect(await profile()).toMatchObject({ status: 'active' });
    expect((await profile()).addressVerifiedAt).not.toBeNull();

    // Background check: the disclosure first, then clear. Onboarding is complete.
    expect(await startBackgroundCheck(db, providers, userId, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { acknowledged: ['must_accept'] } });
    const check = await startBackgroundCheck(db, providers, userId, now(), { acknowledged: true });
    expect(check).toMatchObject({ ok: true, redirectTo: expect.stringContaining('/dev/providers/background?check=') });
    expect(await startBackgroundCheck(db, providers, userId, now(), { acknowledged: true })).toEqual({ ok: false, code: 'not_allowed' });
    await recordBackgroundResult(db, param(check.ok ? check.redirectTo! : '', 'check'), 'clear', now());
    const done = await getOnboardingPageData(db, userId, 'done', now());
    expect(done?.progress.bookableCategories).toEqual(['yard-cleanup', 'light-cleaning']); // category display order
    expect(done?.progress.steps.every((s) => s.state === 'done' || s.state === 'current')).toBe(true);
    expect((await profile()).backgroundCheckedAt).not.toBeNull();
    expect(done?.agreementNeeded).toBe(false);

    // The phone, ID and background checks have all passed: the welcome gift card is theirs on the done step
    // (2026-11-14: no booking, no cohort), with the founding badge's number once they hold one.
    expect(done?.welcomeReward).toMatchObject({ state: 'earned', amountCents: 5000, checks: [{ check: 'phone', state: 'done' }, { check: 'identity', state: 'done' }, { check: 'background', state: 'done' }] });
    await db.update(helperProfiles).set({ foundingNumber: 98 }).where(eq(helperProfiles.userId, userId));
    expect((await getOnboardingPageData(db, userId, 'done', now()))?.welcomeReward).toMatchObject({ state: 'earned', amountCents: 5000, foundingNumber: 98 });
  });

  it('opens every check with the basics, in any order; a verified address opens helping; a confirmed ID with another legal name sends it back to our team (owner, 2026-11-23)', async () => {
    const helper = 'usr_parallel';
    await db.insert(users).values({ id: helper, email: 'parallel@example.test', name: 'Lena R.', firstName: 'Lena', lastName: 'Rivera', homeMarketId: 'mkt_austin', phone: '+15125550392', phoneVerifiedAt: now() });
    expect(await saveHelperProfile(db, helper, { headline: 'Yard help on weekends', bio: 'I rake, weed and haul yard waste, and I always leave the yard tidy and swept.', languages: ['en'], acceptHelperAgreement: true }, now(), { requireAgreement: true })).toEqual({ ok: true, code: 'saved' });
    expect(await saveHelperServices(db, helper, { services: [{ categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2, description: '' }] }, now())).toEqual({ ok: true, code: 'saved' });
    expect(await saveHelperArea(db, helper, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false }, now())).toEqual({ ok: true, code: 'saved' });
    const states = async () => Object.fromEntries((await getOnboardingPageData(db, helper, 'done', now()))!.progress.steps.map((entry) => [entry.step, entry.state]));
    // Any order: payouts open with the basics, before any photos.
    expect(await startPayout(db, providers, helper, now())).toMatchObject({ ok: true });
    expect(await states()).toMatchObject({ identity: 'todo', address: 'todo', payout: 'in_review' });
    expect(await acceptIdentityNotice(db, helper, { consent: true }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await submitIdentityCapture(captureDeps, helper, await idPhotos(), now())).toEqual({ ok: true, code: 'submitted' });
    expect(await states()).toMatchObject({ identity: 'in_review', address: 'todo' });
    const form = new FormData();
    form.set('placeId', 'plc_mueller_1234');
    form.set('documentType', 'utility_bill');
    form.set('declaration', 'true');
    form.set('file', await bill());
    expect(await submitAddressProof({ db, storage, geocoder: createFakeGeocoder(), cipher }, helper, form, now())).toEqual({ ok: true, code: 'submitted' });
    expect(await startPayout(db, providers, helper, now())).toMatchObject({ ok: true });
    await recordPayoutStatus(db, helper, 'active', now());
    // Our team approves the address against the account's name before the ID is confirmed: the location profile opens
    // helping (yard work needs no background check), but she isn't a verified helper yet.
    const [proof] = await db.select({ id: addressVerifications.id }).from(addressVerifications).where(eq(addressVerifications.userId, helper));
    expect(await decideAddress(db, taylor, { verificationId: proof!.id, decision: 'approve', note: 'Name, address and date match the bill.' }, now())).toEqual({ ok: true, code: 'updated' });
    const helping = (await getOnboardingPageData(db, helper, 'done', now()))!.progress;
    expect(helping.bookable).toBe(true);
    expect(helping.verified).toBe(false);
    // The photos approved, the double check confirms an ID with another legal name.
    const [photos] = await db.select({ id: identityCaptures.id }).from(identityCaptures).where(eq(identityCaptures.userId, helper));
    expect(await decideIdentityCapture(db, taylor, { captureId: photos!.id, decision: 'approve', note: 'The selfie matches the passport photo.' }, now(), { doubleCheck: true })).toEqual({ ok: true, code: 'updated' });
    expect(await states()).toMatchObject({ address: 'done', payout: 'done' });
    const identity = await startIdentity(db, providers, helper, now());
    expect(await recordIdentityResult(db, param(identity.ok ? identity.redirectTo! : '', 'session'), { status: 'verified', verifiedName: { firstName: 'Elena', lastName: 'Morales' } }, now())).toBe(helper);
    // The address went back to our team in that same write, and the helper is told why.
    const [again] = await db.select().from(addressVerifications).where(eq(addressVerifications.userId, helper));
    expect(again).toMatchObject({ status: 'in_review', decidedAt: null, decidedByUserId: null });
    expect((await getOnboardingPageData(db, helper, 'address', now()))?.verification.address).toMatchObject({ status: 'in_review', recheck: 'name_differs' });
    const events = await db.select({ payload: outboxEvents.payload }).from(outboxEvents).where(and(eq(outboxEvents.type, 'verification.updated'), eq(outboxEvents.aggregateId, helper)));
    expect(events.map((event) => event.payload)).toContainEqual({ userId: helper, track: 'address', outcome: 'recheck' });
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'address.recheck'), eq(auditLog.targetId, helper)))).toHaveLength(1);
    // The address back with our team: helping waits for it again.
    expect((await getOnboardingPageData(db, helper, 'done', now()))?.progress.bookable).toBe(false);
  });

  it('takes the services and the area before the headline, starting a draft profile (plan 9.11)', async () => {
    const first = 'usr_setup_first';
    await db.insert(users).values({ id: first, email: 'setup-first@example.test', name: 'Robin L.', firstName: 'Robin', lastName: 'Lane', homeMarketId: 'mkt_austin' });
    const modeOf = async () => (await db.select({ mode: users.mode }).from(users).where(eq(users.id, first)))[0]?.mode;
    expect(await modeOf()).toBe('poster');
    // No profile yet: the first part saved starts a draft one, invisible to clients.
    expect(await saveHelperServices(db, first, { services: [{ categorySlug: 'yard-cleanup', pricingType: 'fixed', fromPriceCents: 6000, description: '' }] }, now())).toEqual({ ok: true, code: 'saved' });
    const [draft] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, first));
    expect(draft).toMatchObject({ handle: 'robin-l', status: 'draft', headline: '', bio: '' });
    // Starting setup is choosing to help (journeys on a phone, J-H3): helper mode, so Home leads with the setup. Switched
    // back to getting help, the next part saved leaves it there.
    expect(await modeOf()).toBe('helper');
    await db.update(users).set({ mode: 'poster' }).where(eq(users.id, first));
    expect(await saveHelperArea(db, first, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false }, now())).toEqual({ ok: true, code: 'saved' });

    expect(await modeOf()).toBe('poster');
    const page = await getOnboardingPageData(db, first, 'profile', now());
    const state = (step: string) => page?.progress.steps.find((entry) => entry.step === step)?.state;
    expect([state('services'), state('area'), state('profile')]).toEqual(['done', 'done', 'current']);
    expect(page?.person).toEqual({ firstName: 'Robin', displayName: 'Robin L.', initials: 'RL' });
    // Setup keeps text not saved yet under the account's id (aa's sweep S4).
    expect(page?.userId).toBe(first);
    expect(page?.maxPhotoMegabytes).toBe(10);
    expect(['ai', 'template']).toContain(page?.profileDraft);
    // Prefilled prices: the category's usual pricing, never under what a service may list (aa's sweep S6: hourly work
    // reaches the category's minimum over its minimum hours, so moving help starts at its typical $32 an hour).
    const listable = createHelperServicesSchema(page?.categories ?? []);
    for (const category of page?.categories ?? []) {
      const preset = page?.serviceDefaults[category.slug];
      expect(preset?.pricingType).toBe(category.defaultPricingType);
      expect(listable.safeParse({ services: [{ categorySlug: category.slug, ...preset, description: '' }] }).success).toBe(true);
    }
    expect(page?.serviceDefaults['moving-help']).toEqual({ pricingType: 'hourly', hourlyRateCents: 3200, minHours: 2 });

    // The server checks an hourly rate as posting and offers do: its minimum hours must come to the category's
    // minimum ($35 for moving help, so $17.50 an hour over 2 hours), where the schema never looked at the rate.
    const moving = (hourlyRateCents: number, minHours = 2) => ({ services: [{ categorySlug: 'moving-help' as const, pricingType: 'hourly' as const, hourlyRateCents, minHours, description: '' }] });
    expect(await saveHelperServices(db, first, moving(1500), now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { 'services.0.hourlyRateCents': ['out_of_range'] } });
    expect(await saveHelperServices(db, first, moving(1750), now())).toEqual({ ok: true, code: 'saved' });
    expect(await saveHelperServices(db, first, moving(1200, 3), now())).toEqual({ ok: true, code: 'saved' });
  });

  it('pauses and resumes, and manages work samples', async () => {
    expect(await setHelperPaused(db, userId, true, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('paused');
    // A paused profile has no public page, so the editor doesn't link to one.
    expect(await getProfileEditorData(db, userId, now())).toMatchObject({ paused: true, publicProfile: false });
    expect(await setHelperPaused(db, userId, false, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('active');
    expect(await getProfileEditorData(db, userId, now())).toMatchObject({ paused: false, publicProfile: true });

    const image = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#88aa66' } }).jpeg().toBuffer();
    const upload = async (caption: string) => {
      const form = new FormData();
      form.set('file', new File([new Uint8Array(image)], 'sample.jpg', { type: 'image/jpeg' }));
      form.set('caption', caption);
      form.set('categorySlug', 'yard-cleanup');
      return addWorkSample({ db, storage }, userId, form, now());
    };
    const first = await upload('Leaves bagged');
    const second = await upload('Front beds weeded');
    if (!first.ok || !second.ok || !first.sample || !second.sample) throw new Error('upload failed');
    expect(first.sample).toMatchObject({ caption: 'Leaves bagged', categorySlug: 'yard-cleanup' });

    expect(await reorderWorkSamples(db, userId, [second.sample.id, first.sample.id])).toEqual({ ok: true, code: 'updated' });
    expect(await reorderWorkSamples(db, userId, [first.sample.id])).toEqual({ ok: false, code: 'validation_failed' });
    let editor = await getProfileEditorData(db, userId, now());
    expect(editor?.workSamples.map((s) => s.caption)).toEqual(['Front beds weeded', 'Leaves bagged']);
    expect(editor?.badges).toMatchObject({ phoneVerified: true, idVerifiedAt: expect.any(String), addressVerifiedAt: expect.any(String), backgroundCheckedAt: expect.any(String) });

    const [kept] = await db.select({ fileId: helperWorkSamples.fileId }).from(helperWorkSamples).where(eq(helperWorkSamples.id, first.sample.id));
    expect(await removeWorkSample(db, userId, first.sample.id)).toEqual({ ok: true, code: 'updated' });
    expect(await removeWorkSample(db, 'usr_maya', second.sample.id)).toEqual({ ok: false, code: 'not_found' });
    // Its photo is no longer public (security review 2026-11-20): a link someone kept opens for its owner and staff only.
    const [photo] = await db.select().from(files).where(eq(files.id, kept!.fileId));
    expect(canViewFile(photo!, { userId: null })).toBe(false);
    expect(canViewFile(photo!, { userId })).toBe(true);
    editor = await getProfileEditorData(db, userId, now());
    expect(editor?.workSamples).toHaveLength(1);
    expect(editor?.values.area).toEqual({ where: 'market', areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false, homeZip: '', homeCity: '' });
  });
});
