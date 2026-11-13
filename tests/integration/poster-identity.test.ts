import { and, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routes, type ConfirmBookingInput } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { agreements, users } from '@/modules/accounts/schema';
import { confirmBooking } from '@/modules/bookings/confirm';
import { offers } from '@/modules/offers/schema';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { posterIdentityRequirement, posterRiskFacts } from '@/modules/trust/poster-risk';
import { getPosterIdentityPage, safeContinue, startPosterIdentity } from '@/modules/verification/poster-identity';
import { createDevVerificationProviders } from '@/modules/verification/providers';
import { identityVerifications } from '@/modules/verification/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/** Risk-triggered ID checks for clients (blueprint 01 P2), on a throwaway client with a $600 offer to pay for. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_poster_id';
const TASK = 'tsk_tmp_poster_id';
const OFFER = 'off_tmp_poster_id';
const DAY = 86_400_000;
const now = new Date();
const providers = createDevVerificationProviders();
const deps = { db, payments: createDevPaymentProvider() };
const pay: ConfirmBookingInput = { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true };
const BIG = 66_000;

const report = (id: string, over: Partial<typeof supportCases.$inferInsert> = {}) => ({
  id, type: 'report_user', status: 'open', openedByUserId: 'usr_jordan', subjectUserId: CLIENT, reason: 'harassment', ...over,
});
const setCreatedDaysAgo = (days: number) => db.update(users).set({ createdAt: new Date(now.getTime() - days * DAY) }).where(eq(users.id, CLIENT));

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: CLIENT, email: 'tmp-poster-id@example.test', name: 'Paula P.', firstName: 'Paula', lastName: 'Park', phone: '+15125550611', createdAt: new Date(now.getTime() - 60 * DAY) });
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [jordanOffer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: TASK, slug: `${TASK}-slug`, posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...jordanOffer!, id: OFFER, taskId: TASK, priceCents: 60_000, status: 'pending', revision: 1, expiresAt: new Date(now.getTime() + DAY) });
});

afterAll(async () => {
  await db.delete(offers).where(eq(offers.id, OFFER));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.delete(supportCases).where(eq(supportCases.subjectUserId, CLIENT));
  await db.delete(identityVerifications).where(eq(identityVerifications.userId, CLIENT));
  await db.delete(agreements).where(eq(agreements.userId, CLIENT));
  await db.delete(auditLog).where(eq(auditLog.targetId, CLIENT));
  await db.delete(rateLimits).where(like(rateLimits.key, `%${CLIENT}%`));
  await db.delete(users).where(eq(users.id, CLIENT));
  await pool.end();
});

describe('ID checks for clients', () => {
  it('asks nothing of an established client, even for a large booking', async () => {
    expect(await posterIdentityRequirement(db, CLIENT, now)).toBeNull();
    expect(await posterIdentityRequirement(db, CLIENT, now, BIG)).toBeNull();
    // Nothing asks, so nothing to start (each check costs us).
    expect(await startPosterIdentity(db, providers, CLIENT, now, { consent: true })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await getPosterIdentityPage(db, CLIENT, '/app/tasks/new', now)).toMatchObject({ identity: { status: 'not_started' }, continueHref: '/app/tasks/new' });
    expect((await getPosterIdentityPage(db, CLIENT, undefined, now)).reason).toBeUndefined();
  });

  it('counts two reports in 30 days, not dismissed or older ones, and holds the payment', async () => {
    await db.insert(supportCases).values([
      report('cas_tmp_pid_1'),
      report('cas_tmp_pid_dismissed', { status: 'resolved', resolution: 'no_action' }),
      report('cas_tmp_pid_old', { createdAt: new Date(now.getTime() - 40 * DAY) }),
    ]);
    expect((await posterRiskFacts(db, CLIENT, now))?.recentReports).toBe(1);
    expect(await posterIdentityRequirement(db, CLIENT, now)).toBeNull();

    await db.insert(supportCases).values(report('cas_tmp_pid_2', { type: 'safety' }));
    expect(await posterIdentityRequirement(db, CLIENT, now)).toEqual({ reason: 'reports' });
    expect(await confirmBooking(deps, CLIENT, TASK, OFFER, pay, now)).toEqual({ ok: false, code: 'identity_required' });
    expect(await getPosterIdentityPage(db, CLIENT, routes.app.confirmOffer(TASK, OFFER), now)).toMatchObject({ reason: 'reports', continueHref: routes.app.confirmOffer(TASK, OFFER) });
    await db.delete(supportCases).where(eq(supportCases.subjectUserId, CLIENT));
  });

  it('asks a new account before a booking of $500 or more, not before posting', async () => {
    await setCreatedDaysAgo(2);
    expect(await posterIdentityRequirement(db, CLIENT, now)).toBeNull();
    expect(await posterIdentityRequirement(db, CLIENT, now, 20_000)).toBeNull();
    expect(await posterIdentityRequirement(db, CLIENT, now, BIG)).toEqual({ reason: 'new_account_large_booking' });
    expect(await confirmBooking(deps, CLIENT, TASK, OFFER, pay, now)).toEqual({ ok: false, code: 'identity_required' });
    // The page (reached from the refused booking) offers the check ahead of it.
    expect((await getPosterIdentityPage(db, CLIENT, undefined, now)).reason).toBe('new_account_large_booking');
  });

  it('opens the hosted check after the Texas notice, coming back to the page and then to the booking', async () => {
    const next = routes.app.confirmOffer(TASK, OFFER);
    expect(await startPosterIdentity(db, providers, CLIENT, now, { next })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { consent: ['must_accept'] } });
    const started = await startPosterIdentity(db, providers, CLIENT, now, { consent: true, next });
    expect(started).toMatchObject({ ok: true, code: 'updated' });
    const url = started.ok ? started.redirectTo ?? '' : '';
    expect(url).toContain('/dev/providers/identity?session=');
    expect(url).toContain(`&next=${encodeURIComponent(routes.app.verifyIdentity(next))}`);
    const rows = await db.select().from(identityVerifications).where(eq(identityVerifications.userId, CLIENT));
    expect(rows.map((row) => row.status)).toEqual(['processing']);
    expect(await db.select().from(agreements).where(and(eq(agreements.userId, CLIENT), eq(agreements.doc, 'biometric_consent')))).toHaveLength(1);
    expect(await getPosterIdentityPage(db, CLIENT, next, now)).toMatchObject({ reason: 'new_account_large_booking', identity: { status: 'processing', consentNeeded: false }, continueHref: next });

    // The provider's result arrives: verified.
    await db.update(identityVerifications).set({ status: 'verified', verifiedAt: now, nameMatches: true, updatedAt: now }).where(eq(identityVerifications.userId, CLIENT));
    expect(await posterIdentityRequirement(db, CLIENT, now, BIG)).toBeNull();
    const page = await getPosterIdentityPage(db, CLIENT, next, now);
    expect(page.reason).toBeUndefined();
    expect(page.identity.status).toBe('verified');
  });

  it('asks again when our team does, whatever the amount', async () => {
    await setCreatedDaysAgo(60);
    await db.insert(identityVerifications).values({
      id: 'idv_tmp_pid_request', userId: CLIENT, provider: 'dev', providerSessionId: null, status: 'not_started',
      requestedReason: 'staff_request', requestedByUserId: 'usr_morgan', createdAt: new Date(now.getTime() + 1000), updatedAt: new Date(now.getTime() + 1000),
    });
    const later = new Date(now.getTime() + 2000);
    expect(await posterIdentityRequirement(db, CLIENT, later)).toEqual({ reason: 'staff_request' });
    expect(await getPosterIdentityPage(db, CLIENT, undefined, later)).toMatchObject({ reason: 'staff_request', identity: { status: 'not_started', consentNeeded: false } });
  });

  it('continues only to the app’s own pages', () => {
    expect(safeContinue('/app/tasks/new?category=cleaning&describe=Clean+the+desk')).toBe('/app/tasks/new?category=cleaning&describe=Clean+the+desk');
    expect(safeContinue('/app/tasks/tsk_1/offers/off_2/confirm')).toBe('/app/tasks/tsk_1/offers/off_2/confirm');
    for (const unsafe of ['https://evil.example/app', '//evil.example', '/app//evil.example', '/\\evil.example', '/apps', '/help', 'javascript:alert(1)', 42, undefined]) {
      expect(safeContinue(unsafe)).toBe(routes.app.home());
    }
  });
});
