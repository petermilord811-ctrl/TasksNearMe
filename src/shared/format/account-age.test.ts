import { describe, expect, it } from 'vitest';
import { accountAge } from './account-age';

const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';

describe('accountAge (Reddit-style, owner 2026-11-27)', () => {
  it('counts the largest whole unit: years, then months, then days', () => {
    expect(accountAge('2024-05-20T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toEqual({ unit: 'year', count: 2, years: 2, cakeDay: false });
    expect(accountAge('2026-03-02T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toEqual({ unit: 'month', count: 8, years: 0, cakeDay: false });
    expect(accountAge('2026-11-05T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toEqual({ unit: 'day', count: 12, years: 0, cakeDay: false });
  });

  it('never rounds up: a day short of a month is still days, a day short of a year still months', () => {
    expect(accountAge('2026-10-18T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toMatchObject({ unit: 'day', count: 30 });
    expect(accountAge('2026-10-17T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toMatchObject({ unit: 'month', count: 1 });
    expect(accountAge('2025-11-18T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toMatchObject({ unit: 'month', count: 11, years: 0 });
  });

  it('is 0 days on the day they joined, and never negative when the clocks disagree', () => {
    expect(accountAge('2026-11-17T14:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toEqual({ unit: 'day', count: 0, years: 0, cakeDay: false });
    expect(accountAge('2026-11-18T15:00:00.000Z', '2026-11-17T15:00:00.000Z', AUSTIN)).toEqual({ unit: 'day', count: 0, years: 0, cakeDay: false });
  });

  it('turns over at the market’s midnight, not UTC’s', () => {
    // 11:30 pm in Austin on Nov 16 is already Nov 17 in UTC: still the 16th there.
    const lateEvening = '2026-11-17T05:30:00.000Z';
    expect(accountAge('2026-11-16T15:00:00.000Z', lateEvening, AUSTIN)).toMatchObject({ unit: 'day', count: 0 });
    expect(accountAge('2026-11-16T15:00:00.000Z', lateEvening, GAINESVILLE)).toMatchObject({ unit: 'day', count: 1 });
  });

  it('is their cake day on the anniversary of the day they joined, from the first year on', () => {
    expect(accountAge('2024-05-20T15:00:00.000Z', '2026-05-20T17:00:00.000Z', AUSTIN)).toEqual({ unit: 'year', count: 2, years: 2, cakeDay: true });
    expect(accountAge('2024-05-20T15:00:00.000Z', '2026-05-21T17:00:00.000Z', AUSTIN)).toMatchObject({ cakeDay: false });
    // The day they joined isn't a cake day.
    expect(accountAge('2026-05-20T15:00:00.000Z', '2026-05-20T17:00:00.000Z', AUSTIN)).toMatchObject({ cakeDay: false });
  });

  it('gives a Feb 29 joiner their cake day on Feb 28 in other years', () => {
    expect(accountAge('2024-02-29T15:00:00.000Z', '2025-02-28T17:00:00.000Z', AUSTIN)).toEqual({ unit: 'year', count: 1, years: 1, cakeDay: true });
    expect(accountAge('2024-02-29T15:00:00.000Z', '2025-03-01T17:00:00.000Z', AUSTIN)).toMatchObject({ cakeDay: false, years: 1 });
    expect(accountAge('2024-02-29T15:00:00.000Z', '2028-02-28T17:00:00.000Z', AUSTIN)).toMatchObject({ cakeDay: false, years: 3 });
    expect(accountAge('2024-02-29T15:00:00.000Z', '2028-02-29T17:00:00.000Z', AUSTIN)).toMatchObject({ cakeDay: true, years: 4 });
  });
});
