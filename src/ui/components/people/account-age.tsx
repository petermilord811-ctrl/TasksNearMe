import { Cake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime } from '@/contracts';
import { accountAge } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/**
 * Someone's account age, shown the way Reddit shows its "Reddit Age" (owner, 2026-11-27): "2 y", "8 mo", "12 d", read
 * aloud in full ("2 years"), with the day they joined as its tip. On the anniversary of that day (a year or more
 * on), a cake beside it: their cake day. `now` comes from the page (the request's time), so the server and the
 * browser draw the same age.
 */
export function useAccountAge(since: ISODateTime, now: ISODateTime) {
  const t = useTranslations('accountAge');
  const { formatCalendarDate, timeZone } = useFormat();
  const age = accountAge(since, now, timeZone);
  const count = { unit: age.unit, count: age.count };
  const joinedOn = formatCalendarDate(since);
  const joined = t('joined', { date: joinedOn });
  return {
    age,
    label: t('label'),
    /** "2 y" */
    value: t('value', count),
    /** "2 years" */
    spoken: t('spoken', count),
    /** "May 20, 2024" */
    joinedOn,
    /** The tip: "Joined May 20, 2024", and on their cake day what it is. */
    tip: age.cakeDay ? `${t('cakeDayToday', { years: age.years })} · ${joined}` : joined,
    cakeDay: t('cakeDay'),
  };
}

/** The cake beside someone's age on their cake day. */
export function CakeDayMark({ label, className }: { label: string; className?: string }) {
  return <Cake role="img" aria-label={label} className={cn('size-4 shrink-0 text-primary', className)} />;
}

/**
 * "Account age 2 y", in a line of facts about someone: a task's poster, a booking's client, a helper in the peek, an
 * author's card. Screen readers hear "Account age: 2 years".
 */
export function AccountAgeLine({ since, now, className }: { since: ISODateTime; now: ISODateTime; className?: string }) {
  const age = useAccountAge(since, now);
  return <span title={age.tip} className={cn('inline-flex items-center gap-1 tabular-nums', className)}>
    <span aria-hidden="true">{age.label} <span className="font-semibold text-foreground">{age.value}</span></span>
    <span className="sr-only">{`${age.label}: ${age.spoken}`}</span>
    {age.age.cakeDay && <CakeDayMark label={age.cakeDay} />}
  </span>;
}
