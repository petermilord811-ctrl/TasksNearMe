import Link from 'next/link';
import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type RewardGrantView, type RewardsHandlers } from '@/contracts';
import { formatDate, formatRelative } from '@/shared/format';
import { Money } from '@/ui/components/money/money';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useRewardStatus } from '@/ui/components/status/use-status';
import { RewardGrantActions } from './reward-grant-actions';

export interface RewardGrantCardProps {
  grant: RewardGrantView;
  now: ISODateTime;
  onRedeem: RewardsHandlers['onRedeem'];
}

function RewardStatusDetail({ grant, now }: Pick<RewardGrantCardProps, 'grant' | 'now'>) {
  const t = useTranslations('rewards');
  if (grant.status === 'voided' && grant.voidReason) return t(`voidReasons.${grant.voidReason}`);
  if (grant.status === 'qualified' || grant.status === 'redeemable' || grant.status === 'expired') {
    const date = grant.status === 'qualified' ? grant.holdUntil : grant.expiresAt;
    return date
      ? <time dateTime={date} title={formatRelative(date, now)}>{t(`statusDetails.${grant.status}`, { date: formatDate(date) })}</time>
      : t(`statusFallbacks.${grant.status}`);
  }
  return t(`statusDetails.${grant.status}`);
}

export function RewardGrantCard({ grant, now, onRedeem }: RewardGrantCardProps) {
  const t = useTranslations('rewards');
  const status = useRewardStatus(grant.status, grant.holdUntil);
  const titleId = `reward-grant-${grant.id}`;

  return <article aria-labelledby={titleId} className="min-w-0 space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-badge-reward-foreground"><Gift aria-hidden="true" className="size-4 shrink-0" />{t('card.giftCard')}</p>
      <StatusBadge {...status} />
    </div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 id={titleId} className="min-w-0 text-[17px]/6 font-semibold md:text-lg/6.5">{t(`programs.${grant.program}`)}</h3>
      <Money cents={grant.amountCents} size="lg" />
    </div>
    {grant.program === 'repeat' && grant.clientDisplayName
      ? <p className="text-sm text-muted-foreground">{t('card.withClient', { name: grant.clientDisplayName })}</p>
      : grant.booking && <Link href={routes.app.booking(grant.booking.id)} className="inline-flex min-h-11 max-w-full items-center rounded-sm text-sm text-primary underline underline-offset-4">{grant.booking.title}</Link>}
    <p className="text-sm text-muted-foreground"><RewardStatusDetail grant={grant} now={now} /></p>
    <RewardGrantActions grantId={grant.id} actions={grant.actions} deliveryUrl={grant.deliveryUrl} onRedeem={onRedeem} />
  </article>;
}
