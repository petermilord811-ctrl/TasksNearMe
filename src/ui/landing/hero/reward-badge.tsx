import { useTranslations } from 'next-intl';
import { Gift } from 'lucide-react';
import type { HomePageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';

/**
 * The founding helpers' reward, as a small badge: "$50.00 for the first 100 helpers · 37 spots left". Nothing
 * when the program is off or the cohort is full. The amounts come from the page data as they are.
 */
export function RewardBadge({ reward, className }: { reward: HomePageData['welcomeReward']; className?: string }) {
  const t = useTranslations('landing.hero.reward');
  if (!reward) return null;
  const left = Math.max(0, reward.cohortLimit - reward.spotsClaimed);
  if (left === 0) return null;
  return (
    <p className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full bg-reward/15 px-3 py-1.5 text-xs font-semibold text-foreground', className)}>
      <Gift aria-hidden="true" className="size-3.5 shrink-0 text-reward-foreground dark:text-reward" />
      <span>{t('badge', { amount: formatMoney(reward.amountCents), limit: reward.cohortLimit })}</span>
      <span aria-hidden="true" className="text-muted-foreground">·</span>
      <span className="font-medium text-muted-foreground">{t('spots', { left })}</span>
    </p>
  );
}
