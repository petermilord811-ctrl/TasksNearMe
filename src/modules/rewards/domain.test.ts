import { describe, expect, it } from 'vitest';
import { nextGrantState, repeatProgress, repeatTrigger, welcomeCandidate, type BookingFact } from './domain';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000);
const booking = (over: Partial<BookingFact>): BookingFact => ({ id: 'bkg', title: 'Task', posterUserId: 'usr_maya', status: 'confirmed', fundedAt: day(5), priceCents: 6000, ...over });

describe('welcome reward', () => {
  it('goes to the first funded booking of $40 or more within 60 days of the ID check', () => {
    const verifiedAt = day(0);
    const list = [
      booking({ id: 'small', fundedAt: day(2), priceCents: 3500 }),
      booking({ id: 'canceled', fundedAt: day(3), status: 'canceled' }),
      booking({ id: 'first', fundedAt: day(4) }),
      booking({ id: 'later', fundedAt: day(9) }),
    ];
    expect(welcomeCandidate(list, verifiedAt)?.id).toBe('first');
    expect(welcomeCandidate([booking({ fundedAt: day(61) })], verifiedAt)).toBeUndefined();
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

describe('a grant over time', () => {
  const pending = { program: 'welcome', status: 'pending' as const, holdUntil: null, expiresAt: null };

  it('is voided when its booking is canceled', () => {
    expect(nextGrantState(pending, booking({ status: 'canceled' }), day(10))).toEqual({ status: 'voided', voidReason: 'booking_canceled' });
  });

  it('qualifies when the work is completed and paid, unless the final price fell below the threshold', () => {
    const paid = booking({ status: 'completed', transferredAt: day(10) });
    expect(nextGrantState(pending, paid, day(10))).toEqual({ status: 'qualified', holdUntil: day(17) });
    expect(nextGrantState(pending, { ...paid, finalPriceCents: 3900 }, day(10))).toEqual({ status: 'voided', voidReason: 'below_threshold' });
    expect(nextGrantState(pending, booking({ status: 'completion_submitted' }), day(10))).toBeNull();
  });

  it('after the hold: welcome rewards go to review, repeat rewards become redeemable for 90 days', () => {
    const qualified = { program: 'welcome', status: 'qualified' as const, holdUntil: day(17), expiresAt: null };
    const completed = booking({ status: 'completed', transferredAt: day(10) });
    expect(nextGrantState(qualified, completed, day(16))).toBeNull();
    expect(nextGrantState(qualified, completed, day(17))).toEqual({ status: 'in_review' });
    expect(nextGrantState({ ...qualified, program: 'repeat' }, completed, day(18))).toEqual({ status: 'redeemable', redeemableAt: day(17), expiresAt: day(107) });
    expect(nextGrantState(qualified, booking({ status: 'disputed' }), day(18))).toBeNull();
  });

  it('expires 90 days after becoming redeemable', () => {
    const redeemable = { program: 'repeat', status: 'redeemable' as const, holdUntil: day(17), expiresAt: day(107) };
    expect(nextGrantState(redeemable, undefined, day(106))).toBeNull();
    expect(nextGrantState(redeemable, undefined, day(107))).toEqual({ status: 'expired' });
  });
});
