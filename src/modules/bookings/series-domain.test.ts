import { describe, expect, it } from 'vitest';
import { marketClockTime, marketDayKey } from '@/shared/format';
import {
  ONE_TIME_CHARGE_PLAN,
  VISIT_CHARGE_PLAN,
  addDays,
  chargeSchedule,
  endsOnFor,
  firstChargeAt,
  monthWeekOf,
  pauseLimits,
  paysLater,
  retryChargeAt,
  seriesActions,
  upcomingIndexes,
  visitActions,
  visitDate,
  visitStart,
  visitState,
  weekdayOf,
  type VisitBookingFacts,
} from './series-domain';

const HOUR = 3_600_000;
const at = (iso: string) => new Date(iso);

describe('the series calendar', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
    expect(addDays('2028-02-26', 3)).toBe('2028-02-29');
  });

  it('knows the weekday and which one in the month', () => {
    expect(weekdayOf('2026-11-17')).toBe(2); // a Tuesday
    expect(monthWeekOf('2026-11-03')).toBe(1);
    expect(monthWeekOf('2026-11-17')).toBe(3);
    expect(monthWeekOf('2026-12-29')).toBe(5);
  });

  it('repeats weekly and every 2 weeks from the first visit', () => {
    expect([1, 2, 3, 4].map((index) => visitDate('2026-11-17', 'weekly', index))).toEqual(['2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08']);
    expect([1, 2, 3].map((index) => visitDate('2026-11-17', 'biweekly', index))).toEqual(['2026-11-17', '2026-12-01', '2026-12-15']);
  });

  it('repeats monthly on the same weekday of the month', () => {
    // The 3rd Tuesday: Nov 17, Dec 15, Jan 19, Feb 16.
    expect([1, 2, 3, 4].map((index) => visitDate('2026-11-17', 'monthly', index))).toEqual(['2026-11-17', '2026-12-15', '2027-01-19', '2027-02-16']);
  });

  it('treats a fifth weekday as the last one of each month', () => {
    // Tuesday Dec 29, 2026 is the 5th Tuesday: then the last Tuesdays of January and February.
    expect([1, 2, 3].map((index) => visitDate('2026-12-29', 'monthly', index))).toEqual(['2026-12-29', '2027-01-26', '2027-02-23']);
  });

  it('keeps the wall-clock start across daylight saving', () => {
    // 9:00 am in Austin: 15:00 UTC in winter, 14:00 UTC in summer.
    const series = { timeZone: 'America/Chicago', anchorDate: '2027-03-09', startTime: '09:00', cadence: 'weekly' as const }; // DST starts Mar 14
    expect(visitStart(series, 1).toISOString()).toBe('2027-03-09T15:00:00.000Z');
    expect(visitStart(series, 2).toISOString()).toBe('2027-03-16T14:00:00.000Z');
    expect(marketClockTime(visitStart(series, 2), 'America/Chicago')).toBe('09:00');
    expect(marketDayKey(visitStart(series, 2), 'America/Chicago')).toBe('2027-03-16');
  });

  it('keeps a Gainesville series at 9:00 am Eastern across the same DST change (plan 8.1)', () => {
    const series = { timeZone: 'America/New_York', anchorDate: '2027-03-09', startTime: '09:00', cadence: 'weekly' as const };
    expect(visitStart(series, 1).toISOString()).toBe('2027-03-09T14:00:00.000Z');
    expect(visitStart(series, 2).toISOString()).toBe('2027-03-16T13:00:00.000Z');
    expect(marketClockTime(visitStart(series, 2), 'America/New_York')).toBe('09:00');
  });

  it('keeps the next four visits after now on the calendar', () => {
    const series = { timeZone: 'America/Chicago', anchorDate: '2026-11-17', startTime: '09:00', cadence: 'weekly' as const, status: 'active' as const };
    expect(upcomingIndexes(series, at('2026-11-16T12:00:00Z'))).toEqual([1, 2, 3, 4]);
    // The first visit has started: the next four follow it.
    expect(upcomingIndexes(series, at('2026-11-17T15:30:00Z'))).toEqual([2, 3, 4, 5]);
  });

  it('starts again on the resume date while paused, stops after the last date, and holds nothing once canceled', () => {
    const base = { timeZone: 'America/Chicago', anchorDate: '2026-11-17', startTime: '09:00', cadence: 'weekly' as const };
    expect(upcomingIndexes({ ...base, status: 'paused', pausedUntil: '2026-12-08' }, at('2026-11-18T12:00:00Z'))).toEqual([4, 5, 6, 7]);
    expect(upcomingIndexes({ ...base, status: 'ended', endsOn: '2026-12-01' }, at('2026-11-18T12:00:00Z'))).toEqual([2, 3]);
    expect(upcomingIndexes({ ...base, status: 'canceled' }, at('2026-11-18T12:00:00Z'))).toEqual([]);
  });
});

describe('scheduled charges', () => {
  const start = at('2026-12-01T15:00:00Z');

  it('charges a visit 48 h before, retries at 36 h and 24 h, and gives up 12 h before', () => {
    const { charges, deadline } = chargeSchedule(VISIT_CHARGE_PLAN, start);
    expect(charges.map((time) => (start.getTime() - time.getTime()) / HOUR)).toEqual([48, 36, 24]);
    expect((start.getTime() - deadline.getTime()) / HOUR).toBe(12);
  });

  it('charges a one-time booking 72 h before, retries at 48 h, and cancels it 24 h before', () => {
    const { charges, deadline } = chargeSchedule(ONE_TIME_CHARGE_PLAN, start);
    expect(charges.map((time) => (start.getTime() - time.getTime()) / HOUR)).toEqual([72, 48]);
    expect((start.getTime() - deadline.getTime()) / HOUR).toBe(24);
  });

  it('charges at the planned time, or at once when it has passed, and never after the deadline', () => {
    expect(firstChargeAt(VISIT_CHARGE_PLAN, start, at('2026-11-20T00:00:00Z'))?.toISOString()).toBe('2026-11-29T15:00:00.000Z');
    expect(firstChargeAt(VISIT_CHARGE_PLAN, start, at('2026-11-30T10:00:00Z'))?.toISOString()).toBe('2026-11-30T10:00:00.000Z');
    expect(firstChargeAt(VISIT_CHARGE_PLAN, start, at('2026-12-01T04:00:00Z'))).toBeUndefined();
  });

  it('retries at the next planned time after a failure, never twice in a row', () => {
    expect(retryChargeAt(VISIT_CHARGE_PLAN, start, at('2026-11-29T15:00:00Z'))?.toISOString()).toBe('2026-11-30T03:00:00.000Z');
    // A late first charge (30 h before) skips the 36 h retry it already passed.
    expect(retryChargeAt(VISIT_CHARGE_PLAN, start, at('2026-11-30T09:00:00Z'))?.toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(retryChargeAt(VISIT_CHARGE_PLAN, start, at('2026-11-30T15:00:00Z'))).toBeUndefined();
  });

  it('pays later only when the start is more than 14 days away', () => {
    const now = at('2026-11-17T12:00:00Z');
    expect(paysLater(at('2026-12-01T11:00:00Z'), now)).toBe(false);
    expect(paysLater(at('2026-12-01T13:00:00Z'), now)).toBe(true);
  });
});

describe('visits for both people', () => {
  const now = at('2026-11-20T12:00:00Z');
  const visit = (over: Partial<VisitBookingFacts> = {}): VisitBookingFacts => ({ status: 'scheduled', startAt: at('2026-11-24T15:00:00Z'), ...over });

  it('says what each visit is', () => {
    expect(visitState(visit())).toEqual({ state: 'scheduled' });
    expect(visitState(visit({ fundingFailure: 'payment_declined' }))).toEqual({ state: 'payment_due' });
    expect(visitState(visit({ status: 'confirmed' }))).toEqual({ state: 'booked' });
    expect(visitState(visit({ status: 'in_progress' }))).toEqual({ state: 'booked' });
    expect(visitState(visit({ status: 'completed' }))).toEqual({ state: 'completed' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'visit_skipped', canceledBy: 'helper' }))).toEqual({ state: 'skipped', skippedBy: 'helper' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'visit_skipped', canceledBy: 'poster' }))).toEqual({ state: 'skipped', skippedBy: 'poster' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'series_paused' }))).toEqual({ state: 'skipped', skippedBy: 'pause' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'funding_failed' }))).toEqual({ state: 'skipped', skippedBy: 'payment' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'series_stopped' }))).toEqual({ state: 'canceled' });
    expect(visitState(visit({ status: 'canceled', cancelReason: 'poster_late' }))).toEqual({ state: 'canceled' });
  });

  it('lets the client skip a visit not paid yet, and pay one whose charge failed', () => {
    expect(visitActions('poster', visit(), now)).toEqual(['skip_visit', 'open_booking']);
    expect(visitActions('poster', visit({ fundingFailure: 'insufficient_funds' }), now)).toEqual(['pay_visit', 'skip_visit', 'open_booking']);
    // Paid: canceled on its booking page, under the booking's own policy.
    expect(visitActions('poster', visit({ status: 'confirmed' }), now)).toEqual(['open_booking']);
  });

  it('lets the helper skip only 48 h or more ahead', () => {
    expect(visitActions('helper', visit(), now)).toEqual(['skip_visit', 'open_booking']);
    expect(visitActions('helper', visit({ startAt: new Date(now.getTime() + 47 * HOUR) }), now)).toEqual(['open_booking']);
    expect(visitActions('helper', visit({ status: 'confirmed' }), now)).toEqual(['open_booking']);
  });

  it('offers nothing but the booking once a visit has started', () => {
    expect(visitActions('poster', visit({ startAt: at('2026-11-20T11:00:00Z') }), now)).toEqual(['open_booking']);
  });

  it('gives each person their series actions', () => {
    expect(seriesActions('poster', { status: 'active' })).toEqual(['pause_series', 'change_card', 'cancel_series', 'message']);
    expect(seriesActions('poster', { status: 'paused' })).toEqual(['resume_series', 'change_card', 'cancel_series', 'message']);
    expect(seriesActions('helper', { status: 'active' })).toEqual(['end_series', 'message']);
    expect(seriesActions('helper', { status: 'paused' })).toEqual(['end_series', 'message']);
    expect(seriesActions('poster', { status: 'ended' })).toEqual(['message']);
    expect(seriesActions('helper', { status: 'canceled' })).toEqual(['message']);
  });

  it('gives the notice and pause dates', () => {
    expect(endsOnFor('2026-11-20')).toBe('2026-11-27');
    expect(pauseLimits('2026-11-20')).toEqual({ firstDate: '2026-11-21', lastDate: '2027-02-18' });
  });
});
