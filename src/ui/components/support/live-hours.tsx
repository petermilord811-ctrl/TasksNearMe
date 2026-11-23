import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import type { LiveChatHours } from '@/contracts';
import { INTL_LOCALES } from '@/contracts/locale';
import { marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/** A Sunday, so day `n` of the week is this date plus `n` (weekday names in the reader's language). */
const SUNDAY = Date.UTC(2026, 0, 4);
/** A Monday in winter, for wall-clock times in support's zone. */
const REFERENCE_DAY = '2026-01-05';

/** "Mon–Fri 9:00 am–6:00 pm, Sat 10:00 am–2:00 pm", in the reader's language, as wall-clock times in support's zone. */
export function useLiveHoursSchedule(hours: LiveChatHours): string {
  const t = useTranslations('supportCase.feedback.liveHours');
  const { locale, formatTime } = useFormat(hours.timeZone);
  const weekday = new Intl.DateTimeFormat(INTL_LOCALES[locale], { weekday: 'short', timeZone: 'UTC' });
  const day = (n: number) => weekday.format(new Date(SUNDAY + n * 86_400_000));
  const clock = (value: string) => formatTime(marketLocalToUtc(REFERENCE_DAY, value, hours.timeZone));
  const parts = hours.schedule.map((range) => `${range.fromDay === range.toDay ? day(range.fromDay) : t('days', { from: day(range.fromDay), to: day(range.toDay) })} ${clock(range.opens)}–${clock(range.closes)}`);
  return new Intl.ListFormat(INTL_LOCALES[locale], { style: 'short', type: 'unit' }).format(parts);
}

/**
 * Live chat hours (2026-11-23, owner: "Live support: … office hours"), where a person is asked for: the week's hours in
 * support's zone, and whether it's open now (until when) or when it opens. `waiting`: they already asked, so outside
 * the hours it says support replies in the conversation and by email.
 */
export function LiveChatHoursLine({ hours, waiting = false, className }: { hours: LiveChatHours; waiting?: boolean; className?: string }) {
  const t = useTranslations('supportCase.feedback.liveHours');
  const { formatDateTime, formatTime, zoneName } = useFormat(hours.timeZone);
  const schedule = useLiveHoursSchedule(hours);
  const when = hours.open ? formatTime(hours.nextChange) : `${formatDateTime(hours.nextChange)} ${zoneName}`;
  return <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
    <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
    <span>
      {hours.open ? t('openUntil', { time: `${when} ${zoneName}` }) : waiting ? t('closedWaiting', { time: when }) : t('closed', { time: when })}{' '}
      {t('line', { schedule, zone: zoneName })}
    </span>
  </p>;
}
