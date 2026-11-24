import { describe, expect, it } from 'vitest';
import { allowedChangeTypes, changeExpiresAt, changeScheduleWindow, proposedTerms, type ChangeTerms } from './changes-domain';

const start = new Date('2026-11-21T16:30:00.000Z');
const before = new Date('2026-11-19T18:00:00.000Z');
const during = new Date('2026-11-21T17:00:00.000Z');

const desk: ChangeTerms = { pricingType: 'fixed', priceCents: 6000, hourlyRateCents: null, estimatedHours: null, hoursCap: null, startAt: start, scopeText: 'Assemble the desk.', expenseAllowanceCents: 0 };
const moving: ChangeTerms = { ...desk, pricingType: 'hourly', priceCents: null, hourlyRateCents: 3500, estimatedHours: 3, hoursCap: 4 };

describe('what can change when', () => {
  it('lets everything change before the work, but not the start during it; the hours cap only for hourly work', () => {
    expect(allowedChangeTypes({ status: 'confirmed', pricingType: 'fixed', startAt: start, now: before })).toEqual(['price', 'scope', 'schedule', 'expense_allowance']);
    expect(allowedChangeTypes({ status: 'in_progress', pricingType: 'hourly', startAt: start, now: during })).toEqual(['price', 'scope', 'hours_cap', 'expense_allowance']);
    expect(allowedChangeTypes({ status: 'completion_submitted', pricingType: 'fixed', startAt: start, now: during })).toEqual([]);
  });

  it("keeps a team job's start: the team's time for both helpers (sweep B4)", () => {
    expect(allowedChangeTypes({ status: 'confirmed', pricingType: 'fixed', startAt: start, now: before, teamJob: true })).toEqual(['price', 'scope', 'expense_allowance']);
    expect(allowedChangeTypes({ status: 'confirmed', pricingType: 'fixed', startAt: start, now: before, teamJob: false })).toContain('schedule');
  });

  it('expires at the start before the work, and 24 hours later during it or while waiting for payment', () => {
    expect(changeExpiresAt('proposed', { status: 'confirmed', startAt: start, now: before })).toEqual(start);
    expect(changeExpiresAt('proposed', { status: 'in_progress', startAt: start, now: during })).toEqual(new Date(during.getTime() + 86_400_000));
    expect(changeExpiresAt('pending_funding', { status: 'confirmed', startAt: start, now: before })).toEqual(new Date(before.getTime() + 86_400_000));
  });
});

describe('the proposed terms', () => {
  const allowedBefore = allowedChangeTypes({ status: 'confirmed', pricingType: 'fixed', startAt: start, now: before });

  it('takes only what changed', () => {
    expect(proposedTerms(desk, { priceCents: 8000, scopeText: 'Assemble the desk.' }, allowedBefore)).toMatchObject({ terms: { priceCents: 8000 }, types: ['price'] });
    expect(proposedTerms(moving, { hoursCap: 5 }, ['price', 'scope', 'hours_cap', 'expense_allowance'])).toMatchObject({ terms: { hoursCap: 5 }, types: ['hours_cap'] });
  });

  it('refuses fields that don’t fit now, and a proposal with no change', () => {
    expect(proposedTerms(desk, { start: '2026-11-22T16:30:00.000Z' }, ['price', 'scope', 'expense_allowance'])).toEqual({ fieldErrors: { start: ['invalid'] } });
    expect(proposedTerms(desk, { hourlyRateCents: 4000 }, allowedBefore)).toEqual({ fieldErrors: { hourlyRateCents: ['invalid'] } });
    expect(proposedTerms(desk, { priceCents: 6000 }, allowedBefore)).toEqual({ fieldErrors: { priceCents: ['required'] } });
  });

  it('takes a new start only inside the window the page offers (lifecycle review #11)', () => {
    const window = changeScheduleWindow({ minLeadHours: 2, maxLeadDays: 30 }, before);
    expect(window).toEqual({ earliest: new Date('2026-11-19T20:00:00.000Z'), latest: new Date('2026-12-19T18:00:00.000Z') });
    expect(proposedTerms(desk, { start: '2026-11-22T16:30:00.000Z' }, allowedBefore, window)).toMatchObject({ terms: { startAt: new Date('2026-11-22T16:30:00.000Z') }, types: ['schedule'] });
    // In the past, inside the lead time, past the furthest day, or not a time at all.
    for (const start of ['2026-11-18T16:30:00.000Z', '2026-11-19T19:00:00.000Z', '2026-12-20T16:30:00.000Z', 'soon']) {
      expect(proposedTerms(desk, { start }, allowedBefore, window)).toEqual({ fieldErrors: { start: ['invalid'] } });
    }
    // The current start, sent back unchanged, is no change and needs no window.
    expect(proposedTerms(desk, { start: start.toISOString(), priceCents: 7000 }, allowedBefore, changeScheduleWindow({ minLeadHours: 2 }, during))).toMatchObject({ types: ['price'] });
  });
});
