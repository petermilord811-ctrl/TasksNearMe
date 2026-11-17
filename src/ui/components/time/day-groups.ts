import { useTranslations } from 'next-intl';
import { useFormat } from '@/ui/lib/format';

/** Midday (UTC) on a market day ("2026-11-21"): the same calendar day in every US market, to format the day itself. */
const dayAt = (day: string) => `${day}T18:00:00.000Z`;

/** "Today", "Tomorrow", or the date ("Sat, Nov 21") for a market day, against today's (`dayKey(now)` from `useFormat()`). */
export function useDayLabel(today: string): (day: string) => string {
  const { formatDate } = useFormat();
  const t = useTranslations('common.days');
  const tomorrow = new Date(Date.parse(dayAt(today)) + 86_400_000).toISOString().slice(0, 10);
  return (day) => (day === today ? t('today') : day === tomorrow ? t('tomorrow') : formatDate(dayAt(day)));
}

/** Items in order, grouped while they fall on the same market day (`dayKey` from `useFormat()`: the page's market clock). */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string, dayKey: (value: string) => string): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const item of items) {
    const day = dayKey(at(item));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
