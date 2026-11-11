import Link from 'next/link';
import { ArrowLeft, CalendarDays, Check, Clock3, HelpCircle, Lock, Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  routes, type ActionResult, type BookingActionId, type BookingHubHandlers,
  type BookingPaymentLine, type BookingSheetHandlers, type BookingView, type ISODateTime,
} from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatMonthYear, formatRelative, formatTime, formatTimeRange } from '@/shared/format';
import { CompletionSummary } from '@/ui/components/bookings/completion-summary';
import { PageHeader } from '@/ui/components/layout/page-header';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { GeneralArea } from '@/ui/components/location/general-area';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { PaymentMethodLabel } from '@/ui/components/payments';
import { HelperCard } from '@/ui/components/people/helper-card';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { RatingStars } from '@/ui/components/people/rating-stars';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, usePaymentStatus } from '@/ui/components/status/use-status';
import { Timeline } from '@/ui/components/timeline/timeline';
import { BookingHubActions } from './booking-hub-actions';
import { BookingDisputeCard } from './booking-dispute-card';
import { BookingHubWithoutSheetHandlers } from './booking-hub-with-sheets';

export interface BookingHubScreenProps {
  data: BookingView;
  handlers: BookingHubHandlers;
  /** Compatibility for the existing app route; new callers must supply sheet handlers. */
  sheets?: BookingSheetHandlers;
  now: ISODateTime;
}

export function BookingHubScreen({ sheets, ...props }: BookingHubScreenProps) {
  return sheets ? <BookingHubContent {...props} sheets={sheets} /> : <BookingHubWithoutSheetHandlers {...props} />;
}

function BookingState({ data, now }: { data: BookingView; now: ISODateTime }) {
  const t = useTranslations('bookingHub');
  const role = data.viewerRole;
  const fundingDeadline = data.deadlines.pendingFundingExpiresAt;
  const approvalDeadline = data.deadlines.approvalDueAt;
  const stateTime = data.status === 'pending_funding' ? fundingDeadline
    : data.status === 'in_progress' ? data.checkIn?.arrivedAt : data.terms.start;
  const params = {
    name: data.poster.displayName,
    helper: data.helper.displayName,
    date: formatDate(data.terms.start),
    time: stateTime ? formatTime(stateTime) : '',
    deadline: approvalDeadline ? formatDateTime(approvalDeadline) : '',
    hasTime: (data.status === 'completion_submitted' ? approvalDeadline : stateTime) ? 'yes' : 'no',
  };
  const text = data.status === 'canceled' && data.cancelReason ? t(`canceled.${role}.${data.cancelReason}`, params)
    : data.status === 'completed' && data.completedVia ? t(`completed.${role}.${data.completedVia}`, params)
      : t(`state.${role}.${data.status}`, params);
  const relativeAt = data.status === 'confirmed' ? data.terms.start
    : data.status === 'pending_funding' && role === 'poster' ? fundingDeadline
      : data.status === 'completion_submitted' && role === 'poster' ? approvalDeadline : undefined;

  return <div className="space-y-1 rounded-xl border bg-secondary p-4 text-secondary-foreground">
    <p className="font-medium tabular-nums">{text}</p>
    {relativeAt && <time dateTime={relativeAt} className="block text-sm tabular-nums">{formatRelative(relativeAt, now)}</time>}
  </div>;
}

function BookingPayment({ payment }: { payment: BookingPaymentLine }) {
  const t = useTranslations('bookingHub');
  const status = usePaymentStatus(payment.status);
  return <li className="space-y-3 py-4 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">{t(payment.kind)}</p>
      <p className="text-lg font-semibold tabular-nums">{formatMoney(payment.amountCents)}</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="space-y-1">
        {payment.method && <p><PaymentMethodLabel method={payment.method} /></p>}
        <time dateTime={payment.at} className="block tabular-nums text-muted-foreground">{formatDateTime(payment.at)}</time>
      </div>
      <StatusBadge {...status} />
    </div>
  </li>;
}

/** Initial result/pending states belong to the preview gallery. App pages use BookingHubScreen. */
export function BookingHubContent({ data, handlers, sheets, now, initialResult, initialPending }: Omit<BookingHubScreenProps, 'sheets'> & {
  sheets: BookingSheetHandlers;
  initialResult?: ActionResult;
  initialPending?: BookingActionId;
}) {
  const t = useTranslations('bookingHub');
  const sheetCopy = useTranslations('bookingSheets');
  const categories = useTranslations('helperCard.categories');
  const status = useBookingStatus(data.status, data.viewerRole);
  const { terms, checkIn } = data;
  const schedule = data.task.schedule;

  return <div data-booking-hub className="mx-auto max-w-reading space-y-6 pb-[var(--booking-actions-height,0px)] lg:pb-0">
    <div className="space-y-3">
      <Link href={routes.app.bookings()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />{t('back')}
      </Link>
      <PageHeader title={data.task.title} description={categories(data.task.categorySlug)}><StatusBadge {...status} /></PageHeader>
      <BookingState data={data} now={now} />
    </div>

    {data.dispute && <BookingDisputeCard dispute={data.dispute} viewerRole={data.viewerRole} />}

    <BookingHubActions key={data.id} data={data} handlers={handlers} sheets={sheets} initialResult={initialResult} initialPending={initialPending} />

    {data.myReview && <section aria-label={t('review.title')} className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('review.title')}</h2>
      <p className="font-medium tabular-nums">{t('review.rating', { rating: data.myReview.rating })}</p>
      <RatingStars rating={{ average: data.myReview.rating, count: 1 }} />
      <p className="text-sm text-muted-foreground">{data.myReview.publishedAt
        ? <time dateTime={data.myReview.publishedAt}>{t('review.visible', { date: formatDate(data.myReview.publishedAt) })}</time>
        : t('review.hidden')}</p>
    </section>}

    {data.completion && <section aria-label={t('work')} className="space-y-4">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('work')}</h2>
      <CompletionSummary completion={data.completion} variant={data.viewerRole} />
    </section>}

    <section aria-label={t(data.viewerRole === 'poster' ? 'helper' : 'client')} className="space-y-3">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t(data.viewerRole === 'poster' ? 'helper' : 'client')}</h2>
      {data.viewerRole === 'poster' ? <HelperCard helper={data.helper} variant="compact" /> : <div className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
        <div className="flex items-center gap-3">
          <InitialsAvatar initials={data.poster.initials} />
          <div className="min-w-0 space-y-1">
            <h3 className="break-words font-heading text-[17px]/6 font-semibold">{data.poster.displayName}</h3>
            <p className="text-sm text-muted-foreground">{t('memberSince', { date: formatMonthYear(data.poster.memberSince) })}</p>
          </div>
        </div>
        <VerificationBadges badges={{ phoneVerified: data.poster.phoneVerified }} compact />
      </div>}
    </section>

    <section aria-label={t('whenWhere')} className="space-y-4">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('whenWhere')}</h2>
      <div className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
        <dl className="space-y-4">
          <div className="space-y-1">
            <dt className="flex items-center gap-3 text-sm text-muted-foreground"><CalendarDays aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('agreedStart')}</dt>
            <dd className="pl-8"><time dateTime={terms.start} className="font-medium tabular-nums">{formatDateTime(terms.start)}</time></dd>
          </div>
          <div className="space-y-1">
            <dt className="flex items-center gap-3 text-sm text-muted-foreground"><Clock3 aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('taskWindow')}</dt>
            <dd className="pl-8 tabular-nums">{schedule.flexible
              ? t('flexibleWindow', { date: formatDate(schedule.windowStart) })
              : t('window', { date: formatDate(schedule.windowStart), time: formatTimeRange(schedule.windowStart, schedule.windowEnd) })}</dd>
          </div>
        </dl>
        <div className="border-t pt-5"><GeneralArea location={data.location} /></div>
        {data.addressVisibility !== 'visible' && <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{t(`address.${data.addressVisibility}`)}</span>
        </p>}
      </div>
      {data.addressVisibility === 'visible' && data.exactAddress && <>
        <ExactAddressPanel address={data.exactAddress} mapsHref={routes.external.googleMapsSearch(data.exactAddress)} />
        {data.viewerRole === 'helper' && data.deadlines.addressHiddenAt && <p className="text-sm text-muted-foreground">
          <time dateTime={data.deadlines.addressHiddenAt}>{t('address.visible', { date: formatDateTime(data.deadlines.addressHiddenAt) })}</time>
        </p>}
      </>}
    </section>

    {checkIn && <section aria-label={t('checkIn')} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('checkIn')}</h2>
      <ul className="space-y-3">
        {checkIn.onMyWayAt && <li className="flex items-start gap-3"><Navigation aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><time dateTime={checkIn.onMyWayAt} className="tabular-nums">{t('onMyWay', { time: formatTime(checkIn.onMyWayAt) })}</time></li>}
        {checkIn.lateByMinutes !== undefined && <li className="flex items-start gap-3"><Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" /><span className="tabular-nums">{t('runningLate', { minutes: checkIn.lateByMinutes })}</span></li>}
        {checkIn.arrivedAt && <li className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" /><time dateTime={checkIn.arrivedAt} className="tabular-nums">{t('arrived', { time: formatTime(checkIn.arrivedAt) })}</time></li>}
        {checkIn.cantAccessAt && <li className="flex items-start gap-3"><Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" /><time dateTime={checkIn.cantAccessAt} className="tabular-nums">{sheetCopy('cantAccessAt', { helper: data.helper.displayName, time: formatTime(checkIn.cantAccessAt) })}</time></li>}
      </ul>
      {!checkIn.onMyWayAt && checkIn.lateByMinutes === undefined && !checkIn.arrivedAt && !checkIn.cantAccessAt && <p className="text-sm text-muted-foreground">{t('noCheckIn')}</p>}
    </section>}

    <section aria-label={t('terms')} className="space-y-4">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('terms')}</h2>
      <div className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
        <div className="space-y-2"><h3 className="font-semibold">{t('scope')}</h3><p className="whitespace-pre-wrap break-words">{terms.scopeText}</p></div>
        <div className="space-y-2"><h3 className="font-semibold">{t('pricing')}</h3><p className="tabular-nums">{terms.pricing.type === 'fixed'
          ? t('fixedPrice', { amount: formatMoney(terms.pricing.priceCents) })
          : t('hourlyPrice', { rate: formatMoney(terms.pricing.rateCents), estimate: formatHours(terms.pricing.estimatedHours), cap: formatHours(terms.pricing.hoursCap) })}</p></div>
        <div className="space-y-2"><h3 className="font-semibold">{t('allowance')}</h3>{terms.expenseAllowance ? <>
          <p className="font-medium tabular-nums">{formatMoney(terms.expenseAllowance.amountCents)}</p>
          <p className="break-words text-sm text-muted-foreground">{terms.expenseAllowance.description}</p>
        </> : <p className="text-sm text-muted-foreground">{t('noAllowance')}</p>}</div>
      </div>
      <PriceBreakdown breakdown={terms.breakdown} variant={data.viewerRole} posterTotalLabel={t(data.status === 'pending_funding' ? 'totalDue' : 'totalCharged')} />
      {data.viewerRole === 'poster' && terms.pricing.type === 'hourly' && <p className="rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">{t('hourlyNote', { hours: terms.pricing.hoursCap })}</p>}
    </section>

    {data.viewerRole === 'poster' && data.payments && <section aria-label={t('payments')} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold md:text-[22px]/7.5">{t('payments')}</h2>
      {data.payments.length > 0 ? <ul className="divide-y">{data.payments.map((payment) => <BookingPayment key={payment.id} payment={payment} />)}</ul> : <p className="text-sm text-muted-foreground">{t('noPayments')}</p>}
    </section>}

    <div className="rounded-xl border bg-card p-4 shadow-card sm:p-6"><Timeline events={data.timeline} /></div>

    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <HelpCircle aria-hidden="true" className="mt-1 size-5 shrink-0" />
      <div><p>{t('helpLine')}</p><Link href={routes.help()} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('help')}</Link></div>
    </div>
  </div>;
}
