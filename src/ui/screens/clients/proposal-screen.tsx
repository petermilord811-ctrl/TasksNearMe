import Link from 'next/link';
import { ArrowLeft, CalendarDays, MapPin, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BadgeTone, type ISODateTime, type PaymentAttemptResult, type ProposalHandlers, type ProposalPageData, type RebookProposalStatus } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { useScheduleWords } from '@/ui/components/series/schedule-words';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { Deadline } from '@/ui/components/time/deadline';
import { ProposalActions } from './proposal-actions';

export interface ProposalScreenProps {
  data: ProposalPageData;
  handlers: ProposalHandlers;
  now: ISODateTime;
}

const tones: Record<RebookProposalStatus, BadgeTone> = { sent: 'info', accepted: 'success', declined: 'neutral', expired: 'neutral', withdrawn: 'neutral' };

export function ProposalScreen(props: ProposalScreenProps) {
  return <ProposalContent {...props} />;
}

/** Seeded action states belong to the preview gallery; app pages use ProposalScreen. */
export function ProposalContent({ data, handlers, now, initialResult, initialPending }: ProposalScreenProps & {
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const { formatDate, formatDateTime, zoneName } = useFormat();
  const t = useTranslations('proposal');
  const categories = useTranslations('helperCard.categories');
  const { proposal } = data;
  const { viewerRole, task, helper, client } = proposal;
  const poster = viewerRole === 'poster';
  const scheduleWords = useScheduleWords();

  return <div className="mx-auto max-w-reading space-y-6">
    <Link href={poster ? routes.app.home() : routes.app.clients()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" />{t(poster ? 'backHome' : 'backClients')}
    </Link>
    <header className="space-y-3">
      <StatusBadge tone={tones[proposal.status]} label={t(`status.${proposal.status}`)} />
      <h1 className="font-display text-2xl/8 font-semibold md:text-3xl/9.5 tracking-[-0.025em]">{t(`title.${viewerRole}`, { helper: helper.displayName, client: client.displayName })}</h1>
      <p className="text-muted-foreground">{t(`statusDescription.${proposal.status === 'sent' ? `sent_${viewerRole}` : proposal.status}`, { client: client.displayName })}</p>
      {proposal.expiresAt && <Deadline at={proposal.expiresAt} now={now} label={t('expires')} />}
      {proposal.seriesId
        ? <Link href={routes.app.series(proposal.seriesId)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('viewSeries')}</Link>
        : proposal.bookingId && <Link href={routes.app.booking(proposal.bookingId)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('viewBooking')}</Link>}
    </header>
    <section aria-label={t('task')} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{categories(task.categorySlug)}</p>
        <h2 className="font-display text-xl/7 font-semibold md:text-[22px]/7.5 tracking-[-0.015em]">{task.title}</h2>
      </div>
      <div className="flex items-start gap-2">
        <CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <div><p className="text-sm text-muted-foreground">{t(proposal.schedule ? 'firstVisit' : 'start', { zone: zoneName })}</p><time dateTime={proposal.start} className="font-medium tabular-nums">{formatDateTime(proposal.start)}</time></div>
      </div>
      {proposal.schedule && <div className="flex items-start gap-2">
        <Repeat aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{t('schedule')}</p>
          <p className="font-medium">{scheduleWords(proposal.schedule)}</p>
          {proposal.visitStarts && proposal.visitStarts.length > 1 && <p className="text-sm text-muted-foreground tabular-nums">{t('nextVisits', { dates: proposal.visitStarts.map((start) => formatDate(start)).join(' · ') })}</p>}
        </div>
      </div>}
      <p className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" /><span>{task.areaName}</span></p>
      {proposal.pricing.type === 'hourly' && <p className="text-sm tabular-nums">{t('hourlyTerms', { rate: formatMoney(proposal.pricing.rateCents), estimate: formatHours(proposal.pricing.estimatedHours), cap: formatHours(proposal.pricing.hoursCap) })}</p>}
      {proposal.status === 'sent' && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t(poster ? 'addressPoster' : 'addressHelper')}</p>}
    </section>
    {poster && proposal.exactAddress && <ExactAddressPanel address={proposal.exactAddress} />}
    {proposal.message && <section className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <h2 className="font-display text-xl/7 font-semibold tracking-[-0.015em]">{t('message', { helper: helper.displayName })}</h2>
      <p className="whitespace-pre-wrap break-words">{proposal.message}</p>
    </section>}
    <div className="space-y-3">
      <PriceBreakdown breakdown={proposal.breakdown} variant={viewerRole} title={t(poster ? 'total' : 'earnings')} />
      {poster && proposal.status === 'sent' && <>
        <p className="text-sm text-muted-foreground">{t(proposal.schedule ? 'paymentNoteRepeat' : 'paymentNote')}</p>
        {proposal.pricing.type === 'hourly' && <p className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">{t('hourly', { hours: proposal.pricing.hoursCap })}</p>}
      </>}
    </div>
    <ProposalActions key={proposal.id} data={data} handlers={handlers} initialResult={initialResult} initialPending={initialPending} />
  </div>;
}
