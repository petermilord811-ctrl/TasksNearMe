import { Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminCaseRow, ISODateTime } from '@/contracts';
import { formatHours } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

export type AdminResponseTargetProps = Pick<AdminCaseRow, 'slaDueAt' | 'slaBreached'> & { now: ISODateTime };

export function AdminResponseTarget({ slaDueAt, slaBreached, now }: AdminResponseTargetProps) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('adminCases');
  if (!slaDueAt) return <span className="text-sm text-muted-foreground">{t('noTarget')}</span>;

  // Only format the interval here. The caller supplies whether the response target was breached.
  const minutes = Math.abs(new Date(slaDueAt).getTime() - new Date(now).getTime()) / 60_000;
  const duration = minutes < 60
    ? t('minutes', { count: Math.round(minutes) })
    : minutes < 1440
      ? formatHours(Math.round(minutes / 60))
      : t('days', { count: Math.round(minutes / 1440) });

  return <div className="space-y-1 text-sm tabular-nums">
    <time dateTime={slaDueAt} className="block text-muted-foreground">{formatDateTime(slaDueAt)}</time>
    <span className={cn('inline-flex items-start gap-1.5 font-medium', slaBreached ? 'text-destructive' : 'text-foreground')}>
      <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t(slaBreached ? 'pastDue' : 'dueIn', { duration })}
    </span>
  </div>;
}
