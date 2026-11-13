import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin } from 'lucide-react';
import { routes, type AdminBookingHandlers, type AdminBookingMoney, type AdminBookingPageData, type AdminCaseRow, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { ChecklistItems } from '@/ui/components/bookings/completion-summary';
import { PageHeader } from '@/ui/components/layout/page-header';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, useCaseStatus, useEarningsStatus } from '@/ui/components/status/use-status';
import { AdminBookingTools, type AdminBookingPreviewState } from './admin-booking-tools';
import { AdminRefundRequests } from './admin-refund-requests';

export interface AdminBookingScreenProps { data: AdminBookingPageData; handlers: AdminBookingHandlers; now: ISODateTime }

function EarningsLine({ line }: { line: AdminBookingMoney['earnings'][number] }) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('adminBooking');
  return <li className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="space-y-2"><p className="text-sm font-semibold">{t(`earningsKinds.${line.kind}`)}</p><StatusBadge {...useEarningsStatus(line.status)} />{line.transferredAt && <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={line.transferredAt}>{t('transferred', { at: formatDateTime(line.transferredAt) })}</time></p>}</div>
    <p className="font-semibold tabular-nums sm:text-right">{formatMoney(line.amountCents)}</p>
  </li>;
}

/** What the helper ticked when they sent the work: evidence for a dispute, next to the people. */
function HelperChecklist({ checklist }: { checklist: NonNullable<AdminBookingPageData['checklist']> }) {
  const t = useTranslations('adminBooking');
  const completion = useTranslations('completion');
  const done = checklist.items.filter((item) => item.done).length;
  return <section className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('checklist')}</h2>
      <p className="text-sm tabular-nums text-muted-foreground">{completion('checklist.summary', { done, total: checklist.items.length })}</p>
    </div>
    <p className="text-sm text-muted-foreground">{t('checklistHint')}</p>
    <ChecklistItems checklist={checklist} />
  </section>;
}

function BookingCase({ row, now }: { row: AdminCaseRow; now: ISODateTime }) {
  const { formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminBooking');
  const cases = useTranslations('adminCases');
  return <li className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0 space-y-1"><p className="text-sm text-muted-foreground">{cases(`types.${row.type}`)}</p><Link href={routes.admin.case(row.id)} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{row.subject}</Link><p className="text-sm tabular-nums text-muted-foreground"><time dateTime={row.openedAt} title={formatRelative(row.openedAt, now)}>{t('caseOpened', { at: formatDateTime(row.openedAt) })}</time></p></div>
    <div><StatusBadge {...useCaseStatus(row.status)} /></div>
  </li>;
}

export function AdminBookingScreen(props: AdminBookingScreenProps) { return <AdminBookingContent {...props} />; }

/** Seeds support the preview harness; application screens receive only the ticket's props. */
export function AdminBookingContent({ data, handlers, now, ...previewState }: AdminBookingScreenProps & AdminBookingPreviewState) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('adminBooking');
  const status = useBookingStatus(data.booking.status, 'staff');
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('booking')}</p>
      <PageHeader title={data.booking.title}><StatusBadge {...status} /></PageHeader>
      <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <div><dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{t('start')}</dt><dd className="pl-6 tabular-nums"><time dateTime={data.booking.start}>{formatDateTime(data.booking.start)}</time></dd></div>
        <div><dt className="flex items-center gap-2 text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{t('area')}</dt><dd className="pl-6">{data.booking.areaName}</dd></div>
        <div><dt className="text-muted-foreground">{t('pricing')}</dt><dd>{t(`pricingTypes.${data.booking.pricingType}`)}</dd></div>
      </dl>
      <Link href={routes.admin.task(data.booking.taskId)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('openTask')}</Link>
    </div>
    <AdminBookingTools key={data.booking.id} data={data} handlers={handlers} now={now} {...previewState}>
      <section className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
        <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('people')}</h2>
        <dl className="grid gap-4 sm:grid-cols-2">{(['poster', 'helper'] as const).map((role) => <div key={role} className="space-y-2"><dt className="text-sm text-muted-foreground">{t(role)}</dt><dd className="flex items-center gap-3 font-semibold"><span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{data[role].initials}</span>{data[role].displayName}</dd></div>)}</dl>
      </section>
      {data.checklist && <HelperChecklist checklist={data.checklist} />}
      <section className="space-y-4" aria-label={t('money')}>
        <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('money')}</h2>
        <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
          <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('charged')}</dt><dd className="font-display text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(data.money.chargedCents)}</dd></div>
          <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('refunded')}</dt><dd className="font-display text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(data.money.refundedCents)}</dd></div>
        </dl>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2"><PriceBreakdown breakdown={data.money.breakdown} variant="admin" title={t('agreed')} />{data.money.finalBreakdown && <PriceBreakdown breakdown={data.money.finalBreakdown} variant="admin" title={t('final')} />}</div>
      </section>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
          <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('refunds')}</h2>
          {data.money.refunds.length > 0 ? <ul aria-label={t('refunds')} className="divide-y">{data.money.refunds.map((refund) => <li key={refund.id} className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2"><p className="text-sm font-semibold">{t(t.has(`refundReasons.${refund.reason}`) ? `refundReasons.${refund.reason}` : 'refundReasons.other')}</p><StatusBadge tone={refund.status === 'succeeded' ? 'success' : refund.status === 'failed' ? 'danger' : 'info'} label={t(`refundStatuses.${refund.status}`)} /><p className="text-sm tabular-nums text-muted-foreground"><span>{t('refundDate')}: </span><time dateTime={refund.createdAt}>{formatDateTime(refund.createdAt)}</time></p></div>
            <p className="font-semibold tabular-nums sm:text-right">{formatMoney(refund.amountCents)}</p>
          </li>)}</ul> : <p className="text-sm text-muted-foreground">{t('noRefunds')}</p>}
        </section>
        <section className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]"><h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('earnings')}</h2>{data.money.earnings.length > 0 ? <ul aria-label={t('earnings')} className="divide-y">{data.money.earnings.map((line, index) => <EarningsLine key={index} line={line} />)}</ul> : <p className="text-sm text-muted-foreground">{t('noEarnings')}</p>}</section>
      </div>
      <AdminRefundRequests requests={data.refundRequests} onDecide={handlers.onDecideRefund} now={now} initialDecision={previewState.initialDecision} />
      <section className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]"><h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{t('cases')}</h2>{data.cases.length > 0 ? <ul aria-label={t('cases')} className="divide-y">{data.cases.map((row) => <BookingCase key={row.id} row={row} now={now} />)}</ul> : <p className="text-sm text-muted-foreground">{t('noCases')}</p>}</section>
    </AdminBookingTools>
  </div>;
}
