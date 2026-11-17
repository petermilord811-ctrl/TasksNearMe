import { describe, expect, it } from 'vitest';
import {
  REWARD_BUDGETS,
  REWARD_RULES,
  marketMonthStart,
  nextGrantState,
  nextMarketMonthStart,
  recurringMonthTrigger,
  releasedThisMonthCents,
  repeatProgress,
  repeatTrigger,
  welcomeChecksDone,
  welcomeEarnedAt,
  welcomeReleases,
  type BookingFact,
  type SeriesVisitFact,
} from './domain';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000);
const booking = (over: Partial<BookingFact>): BookingFact => ({ id: 'bkg', title: 'Task', posterUserId: 'usr_maya', status: 'confirmed', fundedAt: day(5), priceCents: 6000, ...over });

const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';

describe('the welcome gift card (the owner’s rule of 2026-11-14)', () => {
  it('is earned the moment the last of the phone, ID and background checks passes, with no booking', () => {
    const facts = { phoneVerifiedAt: day(1), idVerifiedAt: day(3), backgroundCheckedAt: null };
    expect(welcomeChecksDone(facts)).toEqual(['phone', 'identity']);
    expect(welcomeEarnedAt(facts)).toBeNull();
    expect(welcomeEarnedAt({ ...facts, backgroundCheckedAt: day(6) })).toEqual(day(6));
    // Any order: the phone added last earns it then.
    expect(welcomeEarnedAt({ phoneVerifiedAt: day(9), idVerifiedAt: day(3), backgroundCheckedAt: day(6) })).toEqual(day(9));
    expect(welcomeEarnedAt({ phoneVerifiedAt: null, idVerifiedAt: day(3), backgroundCheckedAt: day(6) })).toBeNull();
  });

  it('is $50 with no cohort, threshold, window or monthly budget (the program switch is the only limit)', () => {
    expect(REWARD_RULES.welcome).toEqual({ amountCents: 5000 });
    expect(REWARD_BUDGETS.welcome).toBeUndefined();
  });

  it('leaves the waiting line oldest first while the month’s budget has room for a whole card', () => {
    const queue = [1, 2, 3, 4].map((n) => ({ id: `rwd_${n}`, amountCents: 5000 }));
    expect(welcomeReleases(queue, 0, 15_000)).toEqual(['rwd_1', 'rwd_2', 'rwd_3']);
    expect(welcomeReleases(queue, 12_000, 15_000)).toEqual([]);
    expect(welcomeReleases(queue, 10_000, 15_000)).toEqual(['rwd_1']);
    // No budget: everyone moves on.
    expect(welcomeReleases(queue, 1_000_000, undefined)).toHaveLength(4);
  });

  it('counts against the month (market time) it left the line in, not the month it was earned', () => {
    const now = new Date('2026-12-10T18:00:00.000Z');
    const grants = [
      { program: 'welcome', status: 'in_review', amountCents: 5000, holdUntil: new Date('2026-12-01T06:00:00.000Z') },
      { program: 'welcome', status: 'delivered', amountCents: 5000, holdUntil: new Date('2026-12-05T18:00:00.000Z') },
      // Left the line on Nov 30 at 11 pm in Austin (December in UTC): November's.
      { program: 'welcome', status: 'redeemable', amountCents: 5000, holdUntil: new Date('2026-12-01T05:00:00.000Z') },
      { program: 'welcome', status: 'pending', amountCents: 5000, holdUntil: null },
      { program: 'welcome', status: 'voided', amountCents: 5000, holdUntil: new Date('2026-12-02T18:00:00.000Z') },
      { program: 'repeat', status: 'redeemable', amountCents: 1000, holdUntil: new Date('2026-12-02T18:00:00.000Z') },
    ];
    expect(releasedThisMonthCents(grants, 'welcome', now, AUSTIN)).toBe(10_000);
    expect(nextMarketMonthStart(now, AUSTIN).toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });

  it('follows no booking: a canceled or completed booking never moves it; only an unredeemed card expires', () => {
    const pending = { program: 'welcome', status: 'pending' as const, holdUntil: null, expiresAt: null };
    expect(nextGrantState(pending, booking({ status: 'canceled' }), day(10))).toBeNull();
    expect(nextGrantState(pending, booking({ status: 'completed', transferredAt: day(10) }), day(10))).toBeNull();
    const redeemable = { program: 'welcome', status: 'redeemable' as const, holdUntil: day(1), expiresAt: day(91) };
    expect(nextGrantState(redeemable, undefined, day(90))).toBeNull();
    expect(nextGrantState(redeemable, undefined, day(91))).toEqual({ status: 'expired' });
  });
});

describe('repeat reward', () => {
  it('triggers on the third paid booking of $25 or more with one client within 90 days', () => {
    const list = [booking({ id: 'a', fundedAt: day(1) }), booking({ id: 'b', fundedAt: day(30), priceCents: 2000 }), booking({ id: 'c', fundedAt: day(40) }), booking({ id: 'd', fundedAt: day(80) })];
    expect(repeatTrigger(list, 'usr_maya')?.id).toBe('d');
    expect(repeatTrigger(list, 'usr_ben')).toBeUndefined();
    // Outside 90 days of the first, the window starts again from the second.
    expect(repeatTrigger([booking({ id: 'a', fundedAt: day(1) }), booking({ id: 'b', fundedAt: day(60) }), booking({ id: 'c', fundedAt: day(100) })], 'usr_maya')).toBeUndefined();
  });

  it('shows progress in the current window', () => {
    const list = [booking({ id: 'a', fundedAt: day(1) }), booking({ id: 'b', fundedAt: day(20) })];
    expect(repeatProgress(list, 'usr_maya', day(30))).toEqual({ paidBookings: 2, windowEndsAt: day(91) });
    expect(repeatProgress(list, 'usr_maya', day(200))).toBeUndefined();
  });
});

describe('a booking reward over time', () => {
  const pending = { program: 'repeat', status: 'pending' as const, holdUntil: null, expiresAt: null };

  it('is voided when its booking is canceled', () => {
    expect(nextGrantState(pending, booking({ status: 'canceled' }), day(10))).toEqual({ status: 'voided', voidReason: 'booking_canceled' });
  });

  it('qualifies when the work is completed and paid, unless the final price fell below the threshold', () => {
    const paid = booking({ status: 'completed', transferredAt: day(10) });
    expect(nextGrantState(pending, paid, day(10))).toEqual({ status: 'qualified', holdUntil: day(17) });
    expect(nextGrantState(pending, { ...paid, finalPriceCents: 2400 }, day(10))).toEqual({ status: 'voided', voidReason: 'below_threshold' });
    expect(nextGrantState(pending, booking({ status: 'completion_submitted' }), day(10))).toBeNull();
  });

  it('T-13: still qualifies after a dispute settled at $30 (at least the $25 threshold)', () => {
    const settled = booking({ status: 'completed', transferredAt: day(10), finalPriceCents: 3000 });
    expect(nextGrantState(pending, settled, day(10))).toEqual({ status: 'qualified', holdUntil: day(17) });
  });

  it('after the hold, a repeat reward with a risk signal goes to review instead of redeemable (T-25)', () => {
    const qualified = { program: 'repeat', status: 'qualified' as const, holdUntil: day(17), expiresAt: null };
    expect(nextGrantState({ ...qualified, needsReview: true }, booking({ status: 'completed', transferredAt: day(10) }), day(18))).toEqual({ status: 'in_review' });
  });

  it('after the hold, with no dispute and no risk signal, becomes redeemable for 90 days', () => {
    const qualified = { program: 'repeat', status: 'qualified' as const, holdUntil: day(17), expiresAt: null };
    const completed = booking({ status: 'completed', transferredAt: day(10) });
    expect(nextGrantState(qualified, completed, day(16))).toBeNull();
    expect(nextGrantState(qualified, completed, day(17))).toEqual({ status: 'redeemable', redeemableAt: day(17), expiresAt: day(107) });
    expect(nextGrantState(qualified, booking({ status: 'disputed' }), day(18))).toBeNull();
  });

  it('expires 90 days after becoming redeemable', () => {
    const redeemable = { program: 'repeat', status: 'redeemable' as const, holdUntil: day(17), expiresAt: day(107) };
    expect(nextGrantState(redeemable, undefined, day(106))).toBeNull();
    expect(nextGrantState(redeemable, undefined, day(107))).toEqual({ status: 'expired' });
  });
});

describe('recurring-month reward', () => {
  // Austin dates at 9 am (15:00 UTC in winter).
  const at = (date: string) => new Date(`${date}T15:00:00.000Z`);
  const visit = (bookingId: string, date: string, over: Partial<SeriesVisitFact> = {}): SeriesVisitFact => ({ bookingId, startAt: at(date), status: 'completed', transferredAt: at(date), ...over });

  it('goes to the last visit of the first finished month with every visit, at least two, completed and paid', () => {
    const visits = [visit('nov17', '2026-11-17'), visit('nov24', '2026-11-24'), visit('dec01', '2026-12-01'), visit('dec08', '2026-12-08')];
    expect(recurringMonthTrigger(visits, at('2026-12-10'), AUSTIN)?.bookingId).toBe('nov24');
  });

  it('waits until the month is over', () => {
    expect(recurringMonthTrigger([visit('nov03', '2026-11-03'), visit('nov10', '2026-11-10')], at('2026-11-30'), AUSTIN)).toBeUndefined();
  });

  it('needs two visits in the month, all completed and paid', () => {
    // November: a single visit; December: one skipped; January: one not paid yet; February: both done.
    const visits = [
      visit('nov24', '2026-11-24'),
      visit('dec01', '2026-12-01'),
      visit('dec15', '2026-12-15', { status: 'canceled', transferredAt: undefined }),
      visit('jan05', '2027-01-05'),
      visit('jan19', '2027-01-19', { transferredAt: undefined }),
      visit('feb02', '2027-02-02'),
      visit('feb16', '2027-02-16'),
    ];
    expect(recurringMonthTrigger(visits, at('2027-03-02'), AUSTIN)?.bookingId).toBe('feb16');
    expect(recurringMonthTrigger(visits, at('2027-02-20'), AUSTIN)).toBeUndefined();
  });

  it('has no price threshold once its visit is completed and paid', () => {
    const grant = { program: 'recurring_month', status: 'pending' as const, holdUntil: null, expiresAt: null };
    const fact = { id: 'b', title: 'Yard', posterUserId: 'usr_ben', status: 'completed', fundedAt: day(1), priceCents: 1500, finalPriceCents: 1500, transferredAt: day(2) };
    expect(nextGrantState(grant, fact, day(3))).toMatchObject({ status: 'qualified' });
  });
});

describe('the monthly cap’s month (market time)', () => {
  it('is still November at 11:30 pm on Nov 30 in Austin, though it is December in UTC', () => {
    // 2026-12-01T05:30Z is Nov 30, 11:30 pm CST.
    expect(marketMonthStart(new Date('2026-12-01T05:30:00.000Z'), AUSTIN).toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });

  it('turns at each market’s own midnight: 11:30 pm on Nov 30 in Austin is already December in Gainesville (plan 8.1)', () => {
    const late = new Date('2026-12-01T05:30:00.000Z');
    expect(marketMonthStart(late, AUSTIN).toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(marketMonthStart(late, GAINESVILLE).toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(nextMarketMonthStart(late, GAINESVILLE).toISOString()).toBe('2027-01-01T05:00:00.000Z');
    // A visit at 11:30 pm Nov 30 in Austin belongs to November there, December in Gainesville.
    const visits = [{ bookingId: 'nov', startAt: new Date('2026-11-10T16:00:00.000Z'), status: 'completed', transferredAt: new Date('2026-11-11T16:00:00.000Z') }, { bookingId: 'late', startAt: late, status: 'completed', transferredAt: late }];
    expect(recurringMonthTrigger(visits, new Date('2026-12-02T18:00:00.000Z'), AUSTIN)?.bookingId).toBe('late');
    expect(recurringMonthTrigger(visits, new Date('2026-12-02T18:00:00.000Z'), GAINESVILLE)).toBeUndefined();
  });

  it('turns at midnight in Austin, across daylight saving', () => {
    // Dec 1, 12:30 am CST.
    expect(marketMonthStart(new Date('2026-12-01T06:30:00.000Z'), AUSTIN).toISOString()).toBe('2026-12-01T06:00:00.000Z');
    // Mar 31, 11 pm CDT (DST began Mar 8): still March, which started in CST.
    expect(marketMonthStart(new Date('2027-04-01T04:00:00.000Z'), AUSTIN).toISOString()).toBe('2027-03-01T06:00:00.000Z');
  });
});
