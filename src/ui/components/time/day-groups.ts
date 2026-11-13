import { useTranslations } from 'next-intl';
import { marketDayKey } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';

/** Midday in Austin on a market day ("2026-11-21"), to format the day itself. */
const dayAt = (day: string) => `${day}T18:00:00.000Z`;

/** "Today", "Tomorrow", or the date ("Sat, Nov 21") for a market day, against today's (`marketDayKey(now)`). */
export function useDayLabel(today: string): (day: string) => string {
  const { formatDate } = useFormat();
  const t = useTranslations('common.days');
  const tomorrow = new Date(Date.parse(dayAt(today)) + 86_400_000).toISOString().slice(0, 10);
  return (day) => (day === today ? t('today') : day === tomorrow ? t('tomorrow') : formatDate(dayAt(day)));
}

/** Items in order, grouped while they fall on the same market day (Austin time). */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = marketDayKey(at(item));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
