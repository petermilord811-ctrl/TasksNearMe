import { useTranslations } from 'next-intl';
import { BadgeCheck, Gift, Phone, ShieldCheck } from 'lucide-react';
import type { HomePageData } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { cn } from '@/ui/lib/utils';

/**
 * The welcome gift card, as a small badge in the helper's side of the hero: "$50.00 gift card when you're
 * verified", then the three checks that earn it (phone, ID, background). Every helper who passes them gets it, so
 * there's no count of spots. Nothing when the program is off. The amount comes from the page data as it is.
 */
export function RewardBadge({ reward, className }: { reward: HomePageData['welcomeReward']; className?: string }) {
  const t = useTranslations('landing.hero.reward');
  if (!reward) return null;
  const checks = [
    { key: 'phone', Icon: Phone },
    { key: 'id', Icon: BadgeCheck },
    { key: 'background', Icon: ShieldCheck },
  ] as const;
  return (
    <p className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full bg-reward/15 py-1.5 pr-3 pl-2 text-xs font-semibold text-foreground', className)}>
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-reward text-reward-foreground"><Gift aria-hidden="true" className="size-3" /></span>
      <span>{t('badge', { amount: formatMoney(reward.amountCents) })}</span>
      <span aria-hidden="true" className="text-muted-foreground">·</span>
      <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
        {checks.map(({ key, Icon }, index) => (
          <span key={key} className="inline-flex items-center gap-0.5">
            {index > 0 && <span aria-hidden="true">+</span>}
            <Icon aria-hidden="true" className="size-3" />
            {t(`checks.${key}`)}
          </span>
        ))}
      </span>
    </p>
  );
}
