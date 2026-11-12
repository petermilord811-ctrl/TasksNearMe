import { describe, expect, it } from 'vitest';
import { DEFAULT_CANCELLATION, DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { offerRulesFor } from '@/modules/offers/helper-domain';
import { cancellationSummary, quoteBreakdown } from '@/modules/payments/fees';
import { formatDateTime, formatTime, marketLocalToUtc } from '@/shared/format';
import { bookingActions, type BookingFacts } from './domain';
import { approvalReminderDue } from './reminders';

/**
 * T-30: timers across the US clock changes (Austin: Nov 1, 2026, 2 am → 1 am; Mar 14, 2027, 2 am → 3 am).
 * Deadlines are exact durations (24 h is 24 hours, even when the wall clock moves); what people read is
 * the wall-clock time in America/Chicago.
 */

const HOUR = 3_600_000;
const funded = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 6000 });

describe('T-30: daylight saving time', () => {
  it('free cancellation ends exactly 24 h before the start, shown in Austin time', () => {
    // Sun Nov 1, 2026, 10:00 am CST: 24 h earlier the clocks still said CDT, so it reads 11:00 am Saturday.
    const fallStart = marketLocalToUtc('2026-11-01', '10:00');
    const fall = cancellationSummary(DEFAULT_CANCELLATION, funded, fallStart);
    expect(Date.parse(fallStart) - Date.parse(fall.freeUntil)).toBe(24 * HOUR);
    expect(formatDateTime(fall.freeUntil)).toBe('Sat, Oct 31 · 11:00 am');
    // Sun Mar 14, 2027, 10:00 am CDT: 24 h earlier was CST, so 9:00 am Saturday.
    const springStart = marketLocalToUtc('2027-03-14', '10:00');
    const spring = cancellationSummary(DEFAULT_CANCELLATION, funded, springStart);
    expect(Date.parse(springStart) - Date.parse(spring.freeUntil)).toBe(24 * HOUR);
    expect(formatDateTime(spring.freeUntil)).toBe('Sat, Mar 13 · 9:00 am');
  });

  it('approves 72 h after the work is sent, and reminds 24 h and 4 h before, across the change', () => {
    // Sent Sat Oct 31, 2026 at noon CDT; due Tue Nov 3 at 11:00 am CST (72 hours, one of them repeated).
    const sent = new Date(marketLocalToUtc('2026-10-31', '12:00'));
    const due = new Date(sent.getTime() + 72 * HOUR);
    expect(formatDateTime(due)).toBe('Tue, Nov 3 · 11:00 am');
    expect(approvalReminderDue(due, sent, new Date(due.getTime() - 24 * HOUR))).toEqual({ threshold: 24, hoursLeft: 24 });
    expect(approvalReminderDue(due, sent, new Date(due.getTime() - 4 * HOUR))).toEqual({ threshold: 4, hoursLeft: 4 });
    // Sent Fri Mar 12, 2027 at 6:00 pm CST; due Mon Mar 15 at 7:00 pm CDT.
    const springSent = new Date(marketLocalToUtc('2027-03-12', '18:00'));
    expect(formatDateTime(new Date(springSent.getTime() + 72 * HOUR))).toBe('Mon, Mar 15 · 7:00 pm');
  });

  it('opens check-in 2 h and 30 min before a start just after the clocks spring forward', () => {
    // Sun Mar 14, 2027, 3:30 am CDT is only 1 hour after 1:30 am CST.
    const start = new Date(marketLocalToUtc('2027-03-14', '03:30'));
    const booking: BookingFacts = { status: 'confirmed', startAt: start, remote: false, onMyWayAt: null, arrivedAt: null, fundingExpiresAt: null, approvalDueAt: null, completedAt: null };
    const [onMyWay] = bookingActions(booking, 'helper', new Date(start.getTime() - 3 * HOUR));
    expect(onMyWay).toMatchObject({ id: 'on_my_way', enabled: false, disabledReason: { code: 'available_at', at: new Date(start.getTime() - 2 * HOUR).toISOString() } });
    expect(formatTime(new Date(start.getTime() - 2 * HOUR))).toBe('12:30 am');
  });

  it('offers each wall-clock start time once on the night the clocks fall back', () => {
    // A window from midnight to 4:00 am on Nov 1, 2026: 1:00 and 1:30 happen twice.
    const windowStart = new Date(marketLocalToUtc('2026-11-01', '00:00'));
    const windowEnd = new Date(windowStart.getTime() + 5 * HOUR);
    const rules = offerRulesFor({ windowStart, windowEnd, pricingType: 'fixed', estimatedHours: null }, { minPriceCents: 2500 });
    expect(rules.startTimes).toEqual([...new Set(rules.startTimes)]);
    expect(rules.startTimes).toContain('01:30');
    expect(rules.startTimes.at(0)).toBe('00:00');
  });

  it("offers no start time that doesn't exist on the night the clocks spring forward", () => {
    // Mar 14, 2027: 2:00–2:59 am never happens.
    const windowStart = new Date(marketLocalToUtc('2027-03-14', '01:00'));
    const windowEnd = new Date(marketLocalToUtc('2027-03-14', '05:00'));
    const rules = offerRulesFor({ windowStart, windowEnd, pricingType: 'fixed', estimatedHours: null }, { minPriceCents: 2500 });
    expect(rules.startTimes.some((time) => time.startsWith('02:'))).toBe(false);
    expect(rules.startTimes).toEqual(['01:00', '01:30', '03:00', '03:30', '04:00', '04:30']);
  });
});
