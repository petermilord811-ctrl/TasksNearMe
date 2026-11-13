import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { instantPayoutFee, instantPayoutOffer, requestInstantPayout } from '@/modules/earnings/instant';
import { earnings, payouts } from '@/modules/earnings/schema';
import { getEarningsPage } from '@/modules/earnings/service';
import { payoutAccounts } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/** Instant payouts (blueprint 01 / 04 P2) on the development provider: transfers not yet paid out, now, for a fee. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HELPER = 'usr_tmp_instant';
const now = new Date();
const transferred = (id: string, bookingId: string, amountCents: number) => ({ id, bookingId, helperUserId: HELPER, kind: 'earnings', amountCents, status: 'transferred', transferRef: `devtr_${id}`, transferredAt: now, createdAt: now, updatedAt: now });

beforeAll(async () => {
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'tmp-instant@example.test', name: 'Ines I.', firstName: 'Ines', lastName: 'Ito', phone: '+15125550615' });
  await db.insert(payoutAccounts).values({ userId: HELPER, provider: 'dev', providerAccountId: 'acct_dev_tmp_instant', status: 'active', activatedAt: now, createdAt: now, updatedAt: now });
  await db.insert(earnings).values([transferred('ern_tmp_instant_1', 'bkg_tmp_instant_1', 4000), transferred('ern_tmp_instant_2', 'bkg_tmp_instant_2', 2000)]);
});

afterAll(async () => {
  await db.delete(earnings).where(eq(earnings.helperUserId, HELPER));
  await db.delete(payouts).where(eq(payouts.helperUserId, HELPER));
  await db.delete(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
  await db.delete(rateLimits).where(inArray(rateLimits.key, [`instant-payout:${HELPER}`]));
  await db.delete(users).where(eq(users.id, HELPER));
  await pool.end();
});

describe('instant payouts', () => {
  it('charges 1.5%, at least 50 cents', () => {
    expect(instantPayoutFee(2000)).toBe(50);
    expect(instantPayoutFee(6000)).toBe(90);
    expect(instantPayoutFee(100_000)).toBe(1500);
  });

  it('offers what has been transferred but not paid out, on the earnings page too', async () => {
    expect(await instantPayoutOffer(db, null, HELPER)).toEqual({ availableCents: 6000, feeCents: 90, netCents: 5910 });
    expect((await getEarningsPage(db, HELPER, now)).instantPayout).toEqual({ availableCents: 6000, feeCents: 90, netCents: 5910 });
  });

  it('pays it out at once, marked instant with its fee, and then there is nothing left', async () => {
    expect(await requestInstantPayout(db, null, HELPER, now)).toEqual({ ok: true, code: 'submitted' });
    const [payout] = await db.select().from(payouts).where(eq(payouts.helperUserId, HELPER));
    expect(payout).toMatchObject({ amountCents: 6000, feeCents: 90, method: 'instant', status: 'paid' });
    const rows = await db.select({ status: earnings.status, payoutId: earnings.payoutId }).from(earnings).where(eq(earnings.helperUserId, HELPER));
    expect(rows.every((row) => row.status === 'paid_out' && row.payoutId === payout!.id)).toBe(true);
    expect(await instantPayoutOffer(db, null, HELPER)).toBeNull();
    expect((await getEarningsPage(db, HELPER, now)).instantPayout).toBeUndefined();
  });

  it('refuses when there’s nothing to cash out, and three times a day at most', async () => {
    expect(await requestInstantPayout(db, null, HELPER, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await requestInstantPayout(db, null, HELPER, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await requestInstantPayout(db, null, HELPER, now)).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('needs an active payout account, and enough to be worth the fee', async () => {
    await db.insert(earnings).values(transferred('ern_tmp_instant_3', 'bkg_tmp_instant_3', 300));
    expect(await instantPayoutOffer(db, null, HELPER)).toBeNull();
    await db.update(payoutAccounts).set({ status: 'restricted' }).where(eq(payoutAccounts.userId, HELPER));
    await db.insert(earnings).values(transferred('ern_tmp_instant_4', 'bkg_tmp_instant_4', 9000));
    expect(await instantPayoutOffer(db, null, HELPER)).toBeNull();
  });
});
