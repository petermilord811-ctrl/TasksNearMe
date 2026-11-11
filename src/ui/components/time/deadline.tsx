import { Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { cn } from '@/ui/lib/utils';

export interface DeadlineProps {
  at: ISODateTime;
  now: ISODateTime;
  label?: string;
  tone?: 'neutral' | 'warning' | 'danger';
}

const tones = {
  neutral: 'text-muted-foreground',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const;

export function Deadline({ at, now, label, tone = 'neutral' }: DeadlineProps) {
  const t = useTranslations('money');

  return (
    <div className={cn('flex items-start gap-2 text-sm leading-6', tones[tone])}>
      <Clock3 aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <div className="min-w-0">
        {label && <p className="font-medium">{label}</p>}
        <time dateTime={at} className="tabular-nums">
          {t('deadline', { absolute: formatDateTime(at), relative: formatRelative(at, now) })}
        </time>
      </div>
    </div>
  );
}
