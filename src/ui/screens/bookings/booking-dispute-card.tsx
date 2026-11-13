import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BookingDisputeView, type BookingViewerRole } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { cardTitle, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { useCaseStatus } from '@/ui/components/status/use-status';

export interface BookingDisputeCardProps {
  dispute: BookingDisputeView;
  viewerRole: BookingViewerRole;
}

export function BookingDisputeCard({ dispute, viewerRole }: BookingDisputeCardProps) {
  const t = useTranslations('bookingHub.dispute');
  const reasons = useTranslations('reportProblem.reasons');
  const status = useCaseStatus(dispute.status, viewerRole);
  const { resolution } = dispute;
  const title = t(resolution ? 'resolvedTitle' : 'title');

  return <section aria-label={title} className={cn(surface, surfacePad, 'space-y-4')}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className={sectionTitle}>{title}</h2>
      <StatusBadge {...status} />
    </div>
    <div className="space-y-1">
      <p className="font-medium">{reasons(dispute.reason)}</p>
      <time dateTime={dispute.openedAt} className="block text-sm tabular-nums text-muted-foreground">
        {t('opened', { date: formatDate(dispute.openedAt) })}
      </time>
    </div>
    {resolution ? <div className="space-y-3 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.07]">
      <h3 className={cardTitle}>{t(`resolutions.${resolution.type}`)}</h3>
      <p className="whitespace-pre-wrap break-words">{resolution.summary}</p>
      {viewerRole === 'poster' && resolution.refundCents !== undefined && <p className="rounded-2xl bg-secondary/70 px-3.5 py-3 font-medium tabular-nums text-secondary-foreground">
        {t('refund', { amount: formatMoney(resolution.refundCents) })}
      </p>}
      {viewerRole === 'helper' && resolution.receivesCents !== undefined && <p className="rounded-2xl bg-secondary/70 px-3.5 py-3 font-medium tabular-nums text-secondary-foreground">
        {t('receives', { amount: formatMoney(resolution.receivesCents) })}
      </p>}
    </div> : viewerRole === 'helper' && !dispute.canOpenCase && <p className="text-sm text-muted-foreground">{t('helperReview')}</p>}
    {dispute.canOpenCase && <Link href={routes.app.supportCase(dispute.caseId)} className="group/case inline-flex min-h-11 items-center gap-2 rounded-md font-medium text-primary underline underline-offset-4">
      {t('viewCase')}<ArrowRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover/case:translate-x-0.5 motion-reduce:transition-none" />
    </Link>}
  </section>;
}
