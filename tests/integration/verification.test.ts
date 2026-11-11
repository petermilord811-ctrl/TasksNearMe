import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from '@/integrations/storage';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
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
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const providers = createDevVerificationProviders();
const now = () => new Date();
const userId = 'usr_onboarding';
const param = (url: string, key: string) => new URL(url, 'http://localhost').searchParams.get(key) ?? '';

async function profile() {
  const [row] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId));
  return row!;
}

describe('helper onboarding', () => {
  it('runs from profile to bookable to complete', async () => {
    await db.insert(users).values({ id: userId, email: 'onboarding@example.test', name: 'Sam K.', firstName: 'Sam', lastName: 'Kline' });

    // Profile: a unique handle (Sam Kim already has "sam-k").
    expect(
      await saveHelperProfile(
        db,
        userId,
        { headline: 'Careful cleaning and yard help', bio: 'I clean homes and tidy yards carefully, and I always leave things better than I found them.', languages: ['en', 'es'] },
        now(),
      ),
    ).toEqual({ ok: true, code: 'saved' });
    expect(await profile()).toMatchObject({ handle: 'sam-k-2', status: 'draft' });

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

    // ID check: the provider reports verified.
    const identity = await startIdentity(db, providers, userId, now());
    expect(identity).toMatchObject({ ok: true, redirectTo: expect.stringContaining('/dev/providers/identity?session=') });
    expect(await recordIdentityResult(db, param(identity.ok ? identity.redirectTo! : '', 'session'), { status: 'verified' }, now())).toBe(userId);
    expect((await profile()).idVerifiedAt).not.toBeNull();

    // Payouts: active. Yard work is bookable; cleaning waits for the background check.
    expect(await startPayout(db, providers, userId, now())).toMatchObject({ ok: true, redirectTo: '/dev/providers/payout' });
    await recordPayoutStatus(db, userId, 'active', now());
    const midway = await getOnboardingPageData(db, userId, 'background', now());
    expect(midway?.progress.bookableCategories).toEqual(['yard-cleanup']);
    expect(midway?.verification.background).toMatchObject({ status: 'not_started', requiredFor: ['light-cleaning'] });
    expect((await profile()).status).toBe('active');

    // Background check: clear. Onboarding is complete.
    const check = await startBackgroundCheck(db, providers, userId, now());
    expect(check).toMatchObject({ ok: true, redirectTo: expect.stringContaining('/dev/providers/background?check=') });
    expect(await startBackgroundCheck(db, providers, userId, now())).toEqual({ ok: false, code: 'not_allowed' });
    await recordBackgroundResult(db, param(check.ok ? check.redirectTo! : '', 'check'), 'clear', now());
    const done = await getOnboardingPageData(db, userId, 'done', now());
    expect(done?.progress.bookableCategories).toEqual(['yard-cleanup', 'light-cleaning']); // category display order
    expect(done?.progress.steps.every((s) => s.state === 'done' || s.state === 'current')).toBe(true);
    expect((await profile()).backgroundCheckedAt).not.toBeNull();
  });

  it('pauses and resumes, and manages work samples', async () => {
    expect(await setHelperPaused(db, userId, true, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('paused');
    expect(await setHelperPaused(db, userId, false, now())).toEqual({ ok: true, code: 'updated' });
    expect((await profile()).status).toBe('active');

    const storage = createLocalFileStorage(path.join(os.tmpdir(), `tnm-samples-${process.pid}`));
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

    expect(await removeWorkSample(db, userId, first.sample.id)).toEqual({ ok: true, code: 'updated' });
    expect(await removeWorkSample(db, 'usr_maya', second.sample.id)).toEqual({ ok: false, code: 'not_found' });
    editor = await getProfileEditorData(db, userId, now());
    expect(editor?.workSamples).toHaveLength(1);
    expect(editor?.values.area).toEqual({ areaId: 'area_mueller', serviceRadiusMiles: 5, remoteOk: false });
  });
});
