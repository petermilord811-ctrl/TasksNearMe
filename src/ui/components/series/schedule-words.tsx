import { useTranslations } from 'next-intl';
import type { ISODateTime, SeriesCadence, SeriesSchedule, TimeZone } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { formattersFor, useFormat } from '@/ui/lib/format';

type ScheduleShape = Pick<SeriesSchedule, 'cadence' | 'weekday' | 'monthWeek' | 'firstStart' | 'timeZone'>;

/**
 * How regular visits repeat, in words: "Every week on Tuesday at 9:00 am", "Every 2 weeks on Friday at 1:00 pm",
 * "Monthly on the third Saturday at 10:00 am", "Monthly on the last Monday at 8:00 am" (the time on the series'
 * market clock, completion plan 8.1, in the page's language). Shared by the proposal, the series page and the
 * bookings list.
 */
export function useScheduleWords(): (schedule: ScheduleShape) => string {
  const t = useTranslations('series.schedule');
  const { locale } = useFormat();
  return (schedule) => {
    const weekday = t('weekday', { day: String(schedule.weekday) });
    const time = formattersFor(locale, schedule.timeZone).formatTime(schedule.firstStart);
    if (schedule.cadence === 'monthly') return t('monthly', { nth: t('nth', { n: String(Math.min(5, schedule.monthWeek ?? 1)) }), weekday, time });
    return t(schedule.cadence, { weekday, time });
  };
}

export function ScheduleWords({ schedule }: { schedule: ScheduleShape }) {
  return <>{useScheduleWords()(schedule)}</>;
}

/**
 * The schedule a first visit on `date` at `startTime` (on the market's clock, `timeZone`) would repeat on, for a
 * form that hasn't been sent yet (the server's `scheduleOf` gives the same for a saved series).
 */
export function draftSchedule(cadence: SeriesCadence, date: string, startTime: string, timeZone: TimeZone): ScheduleShape | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return null;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const firstStart: ISODateTime = marketLocalToUtc(date, startTime, timeZone);
  return { cadence, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), monthWeek: Math.min(5, Math.ceil(day / 7)), firstStart, timeZone };
}
