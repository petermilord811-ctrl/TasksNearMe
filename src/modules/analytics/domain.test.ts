import { describe, expect, it } from 'vitest';
import type { MetricTarget, PriceBreakdown } from '@/contracts';
import { computeMetrics, contributionOf, metricsPeriod, share, type BookingFact, type MetricsFacts, type TaskFact } from './domain';

/** Market metrics (B-067): the rules behind `/admin/metrics`, on hand-made facts. */

// Thu, Feb 12 2026, 12:00 pm in Austin (CST).
const now = new Date('2026-02-12T18:00:00.000Z');
const at = (iso: string) => new Date(iso);

/** The $60 booking of blueprint 04 §8: 10% from each side. */
const sixty: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 600,
  helperFeeCents: 600,
  expenseAllowanceCents: 0,
  posterTotalCents: 6600,
  helperEarningsCents: 5400,
  platformRevenueCents: 1200,
};

const AUSTIN = 'America/Chicago';

const task = (id: string, publishedAt: string, extra: Partial<TaskFact> = {}): TaskFact => ({
  id,
  timeZone: AUSTIN,
  posterUserId: 'usr_poster',
  category: 'furniture-assembly',
  categoryName: 'Furniture assembly',
  areaId: 'area_mueller',
  areaName: 'Mueller',
  status: 'open',
  publishedAt: at(publishedAt),
  ...extra,
});

const booking = (id: string, extra: Partial<BookingFact> = {}): BookingFact => ({
  id,
  taskId: `tsk_${id}`,
  posterUserId: 'usr_poster',
  helperUserId: 'usr_helper',
  status: 'confirmed',
  createdAt: at('2026-02-10T17:00:00.000Z'),
  confirmedAt: at('2026-02-10T17:00:00.000Z'),
  startAt: at('2026-02-11T16:00:00.000Z'),
  breakdown: sixty,
  ...extra,
});

const facts = (extra: Partial<MetricsFacts> = {}): MetricsFacts => ({
  tasks: [],
  offerTimes: [],
  bookings: [],
  firstCompletionByPoster: new Map(),
  strikeBookingIds: new Set(),
  disputeBookingIds: new Set(),
  helperIdVerifiedAt: new Map(),
  grants: [],
  budgets: { welcome: 500_000 },
  monthlyCapCents: 7500,
  ...extra,
});

const targetOf = (targets: MetricTarget[], id: MetricTarget['id']) => targets.find((target) => target.id === id)!;

describe('the period', () => {
  it('is the last N market days, today included, from the first one’s market midnight', () => {
    const period = metricsPeriod(7, now, AUSTIN);
    expect(period.dayKeys).toEqual(['2026-02-06', '2026-02-07', '2026-02-08', '2026-02-09', '2026-02-10', '2026-02-11', '2026-02-12']);
    expect(period.from.toISOString()).toBe('2026-02-06T06:00:00.000Z');
  });

  it('keeps one key per day across a daylight-saving change', () => {
    // Nov 1 2026 falls back; just after midnight in Austin on Nov 3.
    const period = metricsPeriod(7, at('2026-11-03T06:30:00.000Z'), AUSTIN);
    expect(period.dayKeys).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    expect(period.from.toISOString()).toBe('2026-10-28T05:00:00.000Z');
  });
});

describe('shares', () => {
  it('carry one decimal, and no percent when there is nothing to divide', () => {
    expect(share(7, 217)).toEqual({ part: 7, whole: 217, percent: 3.2 });
    expect(share(0, 0)).toEqual({ part: 0, whole: 0 });
  });
});

describe('liquidity', () => {
  const tasks = [
    // 9 am, first offer after an hour.
    task('tsk_a', '2026-02-10T15:00:00.000Z', { firstOfferAt: at('2026-02-10T16:00:00.000Z'), status: 'completed' }),
    // 10 am, first offer after 5 hours.
    task('tsk_b', '2026-02-10T16:00:00.000Z', { firstOfferAt: at('2026-02-10T21:00:00.000Z'), category: 'moving-help', categoryName: 'Moving help' }),
    // 10 pm: outside 7 am–9 pm, so not in the 2-hour share.
    task('tsk_c', '2026-02-12T04:00:00.000Z', { areaId: undefined, areaName: undefined }),
    // An hour ago: too new for either share.
    task('tsk_d', '2026-02-12T17:00:00.000Z'),
  ];
  const data = computeMetrics(facts({ tasks, bookings: [booking('a', { taskId: 'tsk_a' })] }), metricsPeriod(7, now, AUSTIN), false);

  it('counts offers within 2 h for tasks posted 7 am–9 pm, and within 24 h for tasks a day old', () => {
    expect(data.liquidity.overall).toEqual({
      offerWithin2h: { part: 1, whole: 2, percent: 50 },
      offerWithin24h: { part: 2, whole: 2, percent: 100 },
      medianFirstOfferMinutes: 180,
      filled: { part: 1, whole: 4, percent: 25 },
    });
    expect(targetOf(data.targets, 'offer_within_2h')).toMatchObject({ status: 'missed', value: { kind: 'share', share: { part: 1, whole: 2 } } });
    expect(targetOf(data.targets, 'posted_to_booked')).toMatchObject({ status: 'missed', maturing: 3 });
  });

  it('judges business hours on each task’s own clock (plan 8.1): 9:30 pm in Gainesville is 8:30 pm in Austin', () => {
    // Posted 02:30 UTC: 9:30 pm EST in Gainesville (outside 7 am–9 pm), 8:30 pm CST in Austin (inside).
    const late = (id: string, timeZone: string) => task(id, '2026-02-11T02:30:00.000Z', { timeZone, firstOfferAt: at('2026-02-11T03:00:00.000Z') });
    const share = (timeZone: string) => computeMetrics(facts({ tasks: [late('tsk_x', timeZone)] }), metricsPeriod(7, now, AUSTIN), false).liquidity.overall.offerWithin2h;
    expect(share(AUSTIN)).toMatchObject({ part: 1, whole: 1 });
    expect(share('America/New_York')).toMatchObject({ part: 0, whole: 0 });
  });

  it('breaks down by category (most posted first) and by area (remote last)', () => {
    expect(data.liquidity.byCategory.map((row) => [row.key, row.posted])).toEqual([['furniture-assembly', 3], ['moving-help', 1]]);
    expect(data.liquidity.byArea.map((row) => [row.key, row.posted, row.remote ?? false])).toEqual([['area_mueller', 3, false], ['remote', 1, true]]);
  });

  it('follows the period’s tasks through the funnel', () => {
    expect(data.funnel.steps.map((step) => [step.id, step.count])).toEqual([['posted', 4], ['offered', 2], ['booked', 1], ['completed', 0], ['rebooked', 0]]);
    expect(data.funnel.steps[2]!.ofPrevious).toEqual({ part: 1, whole: 2, percent: 50 });
  });
});

describe('bookings that started', () => {
  const bookings = [
    booking('done', { status: 'completed', completedAt: at('2026-02-11T20:00:00.000Z') }),
    booking('late', { status: 'canceled' }),
    booking('running', { status: 'in_progress' }),
    // Starts after now: not counted yet.
    booking('later', { startAt: at('2026-02-13T16:00:00.000Z') }),
    // Never paid: not a confirmed booking.
    booking('unpaid', { status: 'canceled', confirmedAt: undefined }),
  ];
  const data = computeMetrics(facts({ bookings, disputeBookingIds: new Set(['done']), strikeBookingIds: new Set(['late']) }), metricsPeriod(7, now, AUSTIN), false);

  it('completion counts finished ones; disputes and strikes count every confirmed one', () => {
    expect(targetOf(data.targets, 'bookings_completed')).toMatchObject({ status: 'missed', value: { share: { part: 1, whole: 2 } }, maturing: 1 });
    // 1 of 3 is above both the 3% and the 2% ceilings.
    expect(targetOf(data.targets, 'bookings_disputed')).toMatchObject({ status: 'missed', value: { share: { part: 1, whole: 3 } } });
    expect(targetOf(data.targets, 'helper_reliability')).toMatchObject({ status: 'missed', value: { share: { part: 1, whole: 3 } } });
  });

  it('compares ceilings exactly (3.2% is over 3%, even though it reads 3.2)', () => {
    const many = Array.from({ length: 217 }, (_, index) => booking(`b${index}`));
    const disputed = computeMetrics(facts({ bookings: many, disputeBookingIds: new Set(many.slice(0, 7).map((item) => item.id)) }), metricsPeriod(7, now, AUSTIN), false);
    expect(targetOf(disputed.targets, 'bookings_disputed')).toMatchObject({ status: 'missed', value: { share: { percent: 3.2 } } });
    const fewer = computeMetrics(facts({ bookings: many, disputeBookingIds: new Set(many.slice(0, 6).map((item) => item.id)) }), metricsPeriod(7, now, AUSTIN), false);
    expect(targetOf(fewer.targets, 'bookings_disputed').status).toBe('met');
  });
});

describe('booking again', () => {
  const completedAt = at('2026-02-11T20:00:00.000Z');
  it('counts a client who booked again within 60 days, not a later visit of a series', () => {
    const first = booking('first', { status: 'completed', completedAt });
    const visit = booking('visit', { taskId: 'tsk_visit', confirmedAt: at('2026-02-12T15:00:00.000Z'), visitIndex: 2, startAt: at('2026-02-19T16:00:00.000Z') });
    const visitsOnly = computeMetrics(facts({ bookings: [first, visit] }), metricsPeriod(7, now, AUSTIN), false);
    expect(targetOf(visitsOnly.targets, 'rebook_60d')).toMatchObject({ value: { share: { part: 0, whole: 1 } }, maturing: 1 });

    const again = booking('again', { taskId: 'tsk_again', confirmedAt: at('2026-02-12T15:00:00.000Z'), startAt: at('2026-02-20T16:00:00.000Z') });
    const data = computeMetrics(facts({ bookings: [first, again], firstCompletionByPoster: new Map([['usr_poster', completedAt]]) }), metricsPeriod(7, now, AUSTIN), false);
    expect(targetOf(data.targets, 'rebook_60d')).toMatchObject({ status: 'met', value: { share: { part: 1, whole: 1 } } });
    expect(data.targets.find((target) => target.id === 'rebook_60d')!.maturing).toBeUndefined();
    // The day it was booked shows a repeat booking.
    expect(data.daily.find((day) => day.day === '2026-02-12')).toMatchObject({ booked: 1, repeat: 1 });
  });
});

describe('money', () => {
  it('reproduces the conservative $6.97 contribution of a $60 booking (blueprint 04 §8)', () => {
    expect(contributionOf([booking('one', { status: 'completed', completedAt: at('2026-02-11T20:00:00.000Z') })], AUSTIN)).toEqual({ cents: 697, bookings: 1 });
  });

  it('splits the payout account’s $2 a month over the helper’s bookings that month', () => {
    const two = ['x', 'y'].map((id) => booking(id, { status: 'completed', completedAt: at('2026-02-11T20:00:00.000Z') }));
    // $1 of account fee each instead of $2.
    expect(contributionOf(two, AUSTIN)).toEqual({ cents: 797, bookings: 2 });
  });

  it('is left out for roles without money, and shown to finance', () => {
    const grants = [
      // Left the welcome line for review on Feb 8: it counts against February's budget.
      { helperUserId: 'usr_helper', program: 'welcome' as const, amountCents: 5000, status: 'delivered' as const, createdAt: at('2026-02-07T12:00:00.000Z'), updatedAt: at('2026-02-11T12:00:00.000Z'), deliveredAt: at('2026-02-11T12:00:00.000Z'), holdUntil: at('2026-02-08T12:00:00.000Z') },
      { helperUserId: 'usr_helper', program: 'repeat' as const, amountCents: 1000, status: 'in_review' as const, createdAt: at('2026-02-10T12:00:00.000Z'), updatedAt: at('2026-02-10T12:00:00.000Z') },
      { helperUserId: 'usr_other', program: 'repeat' as const, amountCents: 1000, status: 'voided' as const, createdAt: at('2026-02-09T12:00:00.000Z'), updatedAt: at('2026-02-10T12:00:00.000Z') },
    ];
    const completed = booking('paid', { status: 'completed', completedAt: at('2026-02-11T20:00:00.000Z') });

    const agent = computeMetrics(facts({ bookings: [completed], grants: [] }), metricsPeriod(7, now, AUSTIN), false);
    expect(agent.canSeeMoney).toBe(false);
    expect(agent.rewards).toBeUndefined();
    expect(targetOf(agent.targets, 'contribution_per_booking')).toEqual({ id: 'contribution_per_booking', area: 'economics', comparison: 'at_least', target: { kind: 'money', cents: 600 }, status: 'restricted' });
    expect(agent.daily.every((day) => day.rewardsDeliveredCents === undefined)).toBe(true);
    expect(agent.totals.rewardsDeliveredCents).toBeUndefined();

    const finance = computeMetrics(facts({ bookings: [completed], grants }), metricsPeriod(7, now, AUSTIN), true);
    expect(targetOf(finance.targets, 'contribution_per_booking')).toMatchObject({ status: 'met', value: { kind: 'money_per_booking', cents: 697, bookings: 1 } });
    expect(finance.rewards!.programs.map((program) => program.program)).toEqual(['welcome', 'repeat', 'recurring_month']);
    expect(finance.rewards!.programs[0]).toMatchObject({ budgetCents: 500_000, budgetPeriod: 'month', releasedThisMonthCents: 5000, committedCents: 5000, deliveredCents: 5000, remainingCents: 495_000, budgetUsedPercent: 1, periodGrantedCents: 5000, periodDeliveredCents: 5000 });
    expect(finance.rewards!.programs[1]).toMatchObject({ committedCents: 1000, inReview: 1, periodVoided: 1, periodGrants: 1 });
    expect(finance.rewards!.programs[1]!.budgetCents).toBeUndefined();
    // $60 of $75 this month: near the cap, not at it.
    expect(finance.rewards).toMatchObject({ periodDeliveredCents: 5000, helpersAtCap: 0, helpersNearCap: 1 });
    expect(finance.totals.rewardsDeliveredCents).toBe(5000);
  });
});

describe('ID checks and incidents', () => {
  it('counts booked helpers verified before their booking; address incidents are not counted here', () => {
    const bookings = [booking('one'), booking('two', { helperUserId: 'usr_late' })];
    const data = computeMetrics(
      facts({ bookings, helperIdVerifiedAt: new Map([['usr_helper', at('2026-01-02T12:00:00.000Z')], ['usr_late', at('2026-02-11T12:00:00.000Z')]]) }),
      metricsPeriod(7, now, AUSTIN),
      true,
    );
    expect(targetOf(data.targets, 'helpers_id_verified')).toMatchObject({ status: 'missed', value: { share: { part: 1, whole: 2 } } });
    expect(targetOf(data.targets, 'address_incidents').status).toBe('not_measured');
  });

  it('says no data rather than met or missed when nothing happened', () => {
    const data = computeMetrics(facts(), metricsPeriod(7, now, AUSTIN), true);
    expect(data.targets.filter((target) => target.status !== 'no_data').map((target) => target.id)).toEqual(['address_incidents']);
    expect(data.daily).toHaveLength(7);
    expect(data.totals).toEqual({ posted: 0, offers: 0, booked: 0, completed: 0, repeat: 0, rewardsDeliveredCents: 0 });
  });
});

describe('the monthly cap in reward spend', () => {
  it('counts the calendar month in Austin time, so a grant from Nov 30 still counts at 11:30 pm that night', () => {
    // Nov 30, 11:30 pm CST (already Dec 1 in UTC); the grant came that afternoon.
    const night = new Date('2026-12-01T05:30:00.000Z');
    const grant = { helperUserId: 'usr_helper', program: 'welcome' as const, amountCents: 7500, status: 'qualified' as const, createdAt: at('2026-11-30T20:00:00.000Z'), updatedAt: at('2026-11-30T20:00:00.000Z') };
    const data = computeMetrics(facts({ grants: [grant] }), metricsPeriod(7, night, AUSTIN), true);
    expect(data.rewards).toMatchObject({ helpersAtCap: 1, helpersNearCap: 0 });
    // After midnight in Austin it's a new month.
    const december = computeMetrics(facts({ grants: [grant] }), metricsPeriod(7, new Date('2026-12-01T06:30:00.000Z'), AUSTIN), true);
    expect(december.rewards).toMatchObject({ helpersAtCap: 0 });
  });
});
