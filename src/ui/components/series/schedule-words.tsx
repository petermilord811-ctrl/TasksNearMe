import { useTranslations } from 'next-intl';
import type { ISODateTime, SeriesCadence, SeriesSchedule } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';

/**
 * How regular visits repeat, in words: "Every week on Tuesday at 9:00 am", "Every 2 weeks on Friday at 1:00 pm",
 * "Monthly on the third Saturday at 10:00 am", "Monthly on the last Monday at 8:00 am" (the time in Austin, in the
 * page's language). Shared by the proposal, the series page and the bookings list.
 */
export function useScheduleWords(): (schedule: Pick<SeriesSchedule, 'cadence' | 'weekday' | 'monthWeek' | 'firstStart'>) => string {
  const t = useTranslations('series.schedule');
  const { formatTime } = useFormat();
  return (schedule) => {
    const weekday = t('weekday', { day: String(schedule.weekday) });
    const time = formatTime(schedule.firstStart);
    if (schedule.cadence === 'monthly') return t('monthly', { nth: t('nth', { n: String(Math.min(5, schedule.monthWeek ?? 1)) }), weekday, time });
    return t(schedule.cadence, { weekday, time });
  };
}

export function ScheduleWords({ schedule }: { schedule: Pick<SeriesSchedule, 'cadence' | 'weekday' | 'monthWeek' | 'firstStart'> }) {
  return <>{useScheduleWords()(schedule)}</>;
}

/**
 * The schedule a first visit on `date` at `startTime` (market time) would repeat on, for a form that hasn't been
 * sent yet (the server's `scheduleOf` gives the same for a saved series).
 */
export function draftSchedule(cadence: SeriesCadence, date: string, startTime: string): Pick<SeriesSchedule, 'cadence' | 'weekday' | 'monthWeek' | 'firstStart'> | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return null;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const firstStart: ISODateTime = marketLocalToUtc(date, startTime);
  return { cadence, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), monthWeek: Math.min(5, Math.ceil(day / 7)), firstStart };
}
