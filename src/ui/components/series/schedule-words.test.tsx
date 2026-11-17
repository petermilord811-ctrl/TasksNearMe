/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/en/ui';
import { ScheduleWords, draftSchedule } from './schedule-words';

afterEach(cleanup);

const words = (schedule: Parameters<typeof ScheduleWords>[0]['schedule']) => {
  render(<NextIntlClientProvider locale="en" messages={messages}><p data-testid="words"><ScheduleWords schedule={schedule} /></p></NextIntlClientProvider>);
  return screen.getByTestId('words').textContent;
};

describe('schedule words', () => {
  it('says how each cadence repeats, at the Austin time', () => {
    // Tuesday, Nov 17 2026 at 9:00 am in Austin.
    const firstStart = '2026-11-17T15:00:00.000Z';
    expect(words({ cadence: 'weekly', weekday: 2, firstStart, timeZone: 'America/Chicago' })).toBe('Every week on Tuesday at 9:00 am');
    cleanup();
    expect(words({ cadence: 'biweekly', weekday: 2, firstStart, timeZone: 'America/Chicago' })).toBe('Every 2 weeks on Tuesday at 9:00 am');
    cleanup();
    expect(words({ cadence: 'monthly', weekday: 2, monthWeek: 3, firstStart, timeZone: 'America/Chicago' })).toBe('Monthly on the third Tuesday at 9:00 am');
    cleanup();
    expect(words({ cadence: 'monthly', weekday: 2, monthWeek: 5, firstStart, timeZone: 'America/Chicago' })).toBe('Monthly on the last Tuesday at 9:00 am');
  });

  it('says the time on the series’ own market clock (plan 8.1)', () => {
    // The same instant is 9:00 am in Austin and 10:00 am in Gainesville.
    expect(words({ cadence: 'weekly', weekday: 2, firstStart: '2026-11-17T15:00:00.000Z', timeZone: 'America/New_York' })).toBe('Every week on Tuesday at 10:00 am');
  });

  it('works out a draft schedule from the form', () => {
    expect(draftSchedule('monthly', '2026-12-29', '08:30', 'America/Chicago')).toEqual({ cadence: 'monthly', weekday: 2, monthWeek: 5, firstStart: '2026-12-29T14:30:00.000Z', timeZone: 'America/Chicago' });
    // The same form in Gainesville: 8:30 am Eastern is an hour earlier in UTC (plan 8.1).
    expect(draftSchedule('weekly', '2026-12-29', '08:30', 'America/New_York')?.firstStart).toBe('2026-12-29T13:30:00.000Z');
    expect(draftSchedule('weekly', '', '09:00', 'America/Chicago')).toBeNull();
  });
});
