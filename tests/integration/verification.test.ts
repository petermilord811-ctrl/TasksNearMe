import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeGeocoder } from '@/integrations/geocoding';
import { createLocalFileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { submitAddressProof } from '@/modules/verification/address';
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
import { addressVerifications } from '@/modules/verification/schema';
import { decideAddress } from '@/modules/verification/staff';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const providers = createDevVerificationProviders();
const now = () => new Date();
const userId = 'usr_onboarding';
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';
const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-onboarding-${process.pid}`));
const cipher = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY ?? '');

async function profile() {
  const [row] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId));
  return row!;
}

async function bill() {
  return new File([new Uint8Array(await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#ffffff' } }).jpeg().toBuffer())], 'bill.jpg', { type: 'image/jpeg' });
}

describe('helper onboarding', () => {
  it('runs from profile to bookable to complete', async () => {
    await db.insert(users).values({ id: userId, email: 'onboarding@example.test', name: 'Sam K.', firstName: 'Sam', lastName: 'Kline' });

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

    // Payouts can't start before the ID check.
    expect(await startPayout(db, providers, userId, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await saveHelperArea(db, userId, { areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false }, now())).toEqual({ ok: true, code: 'saved' });

    // The ID check waits for a verified phone.
    expect(await startIdentity(db, providers, userId, now(), { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(users).set({ phone: '+15125550391', phoneVerifiedAt: now() }).where(eq(users.id, userId));
    expect((await getOnboardingPageData(db, userId, 'phone', now()))?.verification.phone).toEqual({ verified: true, last4: '0391' });

    // ID check: the Texas biometric notice comes first, then the provider reports verified.
    expect(await startIdentity(db, providers, userId, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    const identity = await startIdentity(db, providers, userId, now(), { consent: true });
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
  });

  it('pauses and resumes, and manages work samples', async () => {
    expect(await setHelperPaused(db, userId, true, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('paused');
    expect(await setHelperPaused(db, userId, false, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('active');

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

    expect(await removeWorkSample(db, userId, first.sample.id)).toEqual({ ok: true, code: 'updated' });
    expect(await removeWorkSample(db, 'usr_maya', second.sample.id)).toEqual({ ok: false, code: 'not_found' });
    editor = await getProfileEditorData(db, userId, now());
    expect(editor?.workSamples).toHaveLength(1);
    expect(editor?.values.area).toEqual({ areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false });
  });
});
