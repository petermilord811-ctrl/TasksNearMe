import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BadgeTone, type ChangeReviewHandlers, type ChangeReviewPageData, type ChangeStatus, type ChangeTermsView, type ISODateTime, type PaymentAttemptResult, type ProposableChangeType } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { backArrow, backLink, cardTitle, pageTitle, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { Deadline } from '@/ui/components/time/deadline';
import { cn } from '@/ui/lib/utils';
import { ChangeMoneyComparison } from './change-money-comparison';
import { ChangeReviewActions } from './change-review-actions';

export interface ChangeReviewScreenProps {
  data: ChangeReviewPageData;
  handlers: ChangeReviewHandlers;
  now: ISODateTime;
}

const statusTones: Record<ChangeStatus, BadgeTone> = {
  proposed: 'info', accepted_pending_funding: 'warning', applied: 'success', declined: 'neutral', withdrawn: 'neutral', expired: 'neutral',
};

export function ChangeReviewScreen(props: ChangeReviewScreenProps) {
  return <ChangeReviewContent {...props} />;
}

/** Initial async states are for the preview gallery; app pages use ChangeReviewScreen. */
export function ChangeReviewContent({ data, handlers, now, initialResult, initialPending }: ChangeReviewScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('changes.review');
  const { booking, change } = data;
  const otherName = booking.viewerRole === 'poster' ? booking.helperDisplayName : booking.posterDisplayName;
  const statusLabel = change.status === 'proposed'
    ? change.fromMe ? t('waiting.person', { name: otherName }) : t('waiting.you')
    : change.status === 'accepted_pending_funding' && booking.viewerRole === 'poster' && change.differenceCents !== undefined
      ? t('payToApply', { amount: formatMoney(change.differenceCents) })
      : t(`statuses.${change.status}`);

  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={routes.app.booking(booking.id)} className={backLink}>
      <ArrowLeft aria-hidden="true" className={backArrow} />{t('back')}
    </Link>
    <header className="space-y-3">
      <h1 className={cn(pageTitle, 'break-words')}>{t('title', { title: booking.title })}</h1>
      <StatusBadge tone={statusTones[change.status]} label={statusLabel} />
      <p className="text-sm text-muted-foreground">{t(change.status === 'applied' ? 'newTermsApply' : change.status === 'proposed' || change.status === 'accepted_pending_funding' ? 'currentTermsApply' : 'termsUnchanged')}</p>
      {change.expiresAt && <Deadline at={change.expiresAt} now={now} label={t('expires')} tone="warning" />}
    </header>
    <section aria-label={t('proposal')} className={cn(surface, surfacePad, 'space-y-3')}>
      <h2 className={sectionTitle}>{change.fromMe ? t('proposedBy.you') : t('proposedBy.person', { name: otherName })}</h2>
      <time dateTime={change.createdAt} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(change.createdAt)}</time>
      <p className="whitespace-pre-wrap break-words">{change.message}</p>
    </section>
    <section aria-label={t('comparison')} className="space-y-4">
      <h2 className={sectionTitle}>{t('comparison')}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Terms terms={change.current} types={change.types} proposed={false} />
        <Terms terms={change.proposed} types={change.types} proposed />
      </div>
    </section>
    <ChangeMoneyComparison before={change.before} after={change.after} viewerRole={booking.viewerRole} differenceCents={change.differenceCents} />
    <ChangeReviewActions key={`${change.id}-${change.status}`} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />
  </div>;
}

function Terms({ terms, types, proposed }: { terms: ChangeTermsView; types: ProposableChangeType[]; proposed: boolean }) {
  const { formatDateTime, zoneName } = useFormat();
  const t = useTranslations('changes.review');
  const rows: { type: ProposableChangeType; value: string }[] = [
    { type: 'price', value: terms.pricing.type === 'fixed' ? formatMoney(terms.pricing.priceCents) : t('hourlyRate', { amount: formatMoney(terms.pricing.rateCents) }) },
    ...(terms.pricing.type === 'hourly' ? [{ type: 'hours_cap' as const, value: formatHours(terms.pricing.hoursCap) }] : []),
    { type: 'schedule', value: formatDateTime(terms.start) },
    { type: 'scope', value: terms.scopeText },
    { type: 'expense_allowance', value: formatMoney(terms.expenseAllowanceCents) },
  ];
  return <div className={cn(surface, 'min-w-0 p-5', proposed && 'border-primary/40 ring-1 ring-primary/15 dark:border-primary/45')}>
    <h3 className={cn(cardTitle, 'mb-4')}>{t(proposed ? 'proposed' : 'current')}</h3>
    <dl className="space-y-4">
      {rows.map(({ type, value }) => <div key={type} className={cn('min-w-0 space-y-1', types.includes(type) && '-ml-3 rounded-r-xl border-l-2 border-primary bg-primary/[0.035] py-1 pl-3 pr-2')}>
        <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {t(`types.${type}`, { zone: zoneName })}
          {types.includes(type) && <span className="rounded-full bg-badge-brand px-2 py-0.5 text-xs font-medium text-badge-brand-foreground">{t('changed')}</span>}
        </dt>
        <dd className={cn('whitespace-pre-wrap break-words text-sm leading-6', type !== 'scope' && 'tabular-nums')}>{value}</dd>
      </div>)}
    </dl>
  </div>;
}
