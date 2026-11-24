import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SparkLevel, SparksSummary } from '@/contracts';
import { cn } from '@/ui/lib/utils';

const levelTone: Record<SparkLevel, string> = {
  newcomer: 'bg-badge-neutral text-badge-neutral-foreground',
  neighbor: 'bg-badge-info text-badge-info-foreground',
  good_neighbor: 'bg-badge-success text-badge-success-foreground',
  friendly_face: 'bg-badge-reward text-badge-reward-foreground',
  pillar: 'bg-badge-brand text-badge-brand-foreground',
  local_legend: 'bg-badge-warning text-badge-warning-foreground',
};

/**
 * Someone's Sparks (2026-11-21): their level and total, with the bought part beside it whenever there is one, so a
 * bought total never passes for an earned one. `compact` for cards and author lines.
 */
export function SparksBadge({ sparks, compact = false, className }: { sparks: SparksSummary; compact?: boolean; className?: string }) {
  const t = useTranslations('sparksBadge');
  const total = sparks.total.toLocaleString();
  const bought = sparks.bought.toLocaleString();
  const label = sparks.bought > 0 ? t('labelBought', { total, bought, level: t(`levels.${sparks.level}`) }) : t('label', { total, level: t(`levels.${sparks.level}`) });
  return <span role="img" aria-label={label} title={label} className={cn('inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5', compact ? 'text-xs' : 'text-sm', className)}>
    <span aria-hidden="true" className={cn('inline-flex items-center gap-1 rounded-full font-semibold', compact ? 'px-1.5 py-px' : 'px-2.5 py-0.5', levelTone[sparks.level])}>
      <Sparkles className={compact ? 'size-3' : 'size-3.5'} />
      <span className="tabular-nums">{total}</span>
      <span>· {t(`levels.${sparks.level}`)}</span>
    </span>
    {sparks.bought > 0 && <span aria-hidden="true" className="tabular-nums text-muted-foreground">{t('bought', { bought })}</span>}
  </span>;
}
