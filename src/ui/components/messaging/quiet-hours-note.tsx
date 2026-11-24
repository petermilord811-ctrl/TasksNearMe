import { MoonStar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/**
 * Above the message box while the other person's quiet hours keep a new message from their phone and email (2026-11-24):
 * "Sam's quiet hours: they'll see this after 8:00 am", on the reader's own clock. Only when they turned quiet hours on.
 */
export function QuietHoursNote({ name, until, compact = false }: { name: string; until: ISODateTime; compact?: boolean }) {
  const t = useTranslations('thread');
  const { formatTime } = useFormat();
  return <p role="note" className={cn('flex items-center gap-2 border-t border-foreground/[0.07] bg-muted/40 text-muted-foreground dark:border-white/[0.06]', compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs sm:text-sm')}>
    <MoonStar aria-hidden="true" className="size-3.5 shrink-0" />
    <span>{t('quietHours', { name, time: formatTime(until) })}</span>
  </p>;
}
