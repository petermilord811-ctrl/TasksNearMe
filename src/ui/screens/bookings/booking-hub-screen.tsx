import Link from 'next/link';
import { ArrowLeft, CalendarDays, Check, Clock3, HelpCircle, Lock, Navigation, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  routes, type ActionResult, type BadgeTone, type BookingActionId, type BookingHubHandlers,
  type BookingPaymentLine, type BookingSheetHandlers, type BookingTipHandlers, type BookingView, type ISODateTime,
  type ScheduledPaymentHandlers,
} from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { CompletionSummary } from '@/ui/components/bookings/completion-summary';
import { backArrow, backLink, note, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
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
import { cn } from '@/ui/lib/utils';
import { BookingHubActions } from './booking-hub-actions';
import { BookingDisputeCard } from './booking-dispute-card';
import { BookingTipCard, type TipCardPreviewState } from './booking-tip-card';
import { ScheduledPaymentCard, type ScheduledPaymentPreviewState } from './scheduled-payment-card';
import { BookingHubWithoutSheetHandlers } from './booking-hub-with-sheets';

export interface BookingHubScreenProps {
  data: BookingView;
  handlers: BookingHubHandlers;
  /** Compatibility for the existing app route; new callers must supply sheet handlers. */
  sheets?: BookingSheetHandlers;
  /** The client's tip card (UI-057). Without it no tip can be added (a tip already given still shows). */
  tip?: BookingTipHandlers;
  /** A booking paid later (`scheduled`): the client pays now. Without it the card only says when it's charged. */
  scheduledPayment?: ScheduledPaymentHandlers;
  now: ISODateTime;
}

export function BookingHubScreen({ sheets, ...props }: BookingHubScreenProps) {
  return sheets ? <BookingHubContent {...props} sheets={sheets} /> : <BookingHubWithoutSheetHandlers {...props} />;
}

/** Where the booking stands, tinted like its status badge (the same tone, softer). */
const stateTones: Record<BadgeTone, string> = {
  neutral: 'border-foreground/[0.07] bg-secondary/80 text-secondary-foreground',
  brand: 'border-primary/15 bg-badge-brand text-badge-brand-foreground',
  info: 'border-info/20 bg-badge-info text-badge-info-foreground',
  success: 'border-success/20 bg-badge-success text-badge-success-foreground',
  warning: 'border-warning/30 bg-badge-warning text-badge-warning-foreground',
  danger: 'border-destructive/25 bg-badge-danger text-badge-danger-foreground',
  reward: 'border-reward/25 bg-badge-reward text-badge-reward-foreground',
};

function BookingState({ data, now, tone }: { data: BookingView; now: ISODateTime; tone: BadgeTone }) {
  const { formatDate, formatDateTime, formatRelative, formatTime, dayKey } = useFormat();
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
    // "Started at 1:55 am" today; with the day when it was another day (audit L32).
    today: stateTime && dayKey(stateTime) !== dayKey(now) ? 'no' : 'yes',
    when: stateTime ? formatDateTime(stateTime) : '',
    // A confirmed booking whose start has passed (nobody checked in yet): "Was due to start" (audit M51).
    late: data.status === 'confirmed' && Date.parse(data.terms.start) <= Date.parse(now) ? 'yes' : 'no',
    deadline: approvalDeadline ? formatDateTime(approvalDeadline) : '',
    hasTime: (data.status === 'completion_submitted' ? approvalDeadline : stateTime) ? 'yes' : 'no',
  };
  const text = data.status === 'canceled' && data.cancelReason ? t(`canceled.${role}.${data.cancelReason}`, params)
    : data.status === 'completed' && data.completedVia ? t(`completed.${role}.${data.completedVia}`, params)
      : t(`state.${role}.${data.status}`, params);
  const relativeAt = data.status === 'confirmed' ? data.terms.start
    : data.status === 'pending_funding' && role === 'poster' ? fundingDeadline
      : data.status === 'completion_submitted' && role === 'poster' ? approvalDeadline : undefined;

  return <div className={cn('space-y-1 rounded-2xl border px-4 py-3.5', stateTones[tone])}>
    <p className="font-medium text-pretty tabular-nums">{text}</p>
    {relativeAt && <time dateTime={relativeAt} className="block text-sm tabular-nums opacity-90">{formatRelative(relativeAt, now)}</time>}
    {/* The helper canceled and the task is open for offers again (on its own, or by Find a replacement). */}
    {data.taskReopened && <p className="flex flex-wrap items-baseline gap-x-2 pt-1 text-sm">
      <span>{t('taskReopened.body')}</span>
      <Link href={routes.app.task(data.task.id)} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">{t('taskReopened.link')}</Link>
    </p>}
  </div>;
}

function BookingPayment({ payment }: { payment: BookingPaymentLine }) {
  const { formatDateTime } = useFormat();
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
export function BookingHubContent({ data, handlers, sheets, tip, scheduledPayment, now, initialResult, initialPending, tipPreview, scheduledPreview }: Omit<BookingHubScreenProps, 'sheets'> & {
  sheets: BookingSheetHandlers;
  initialResult?: ActionResult;
  initialPending?: BookingActionId;
  tipPreview?: TipCardPreviewState;
  scheduledPreview?: ScheduledPaymentPreviewState;
}) {
  const { formatDate, formatDateTime, formatMonthYear, formatTime, formatTimeRange } = useFormat();
  const t = useTranslations('bookingHub');
  const sheetCopy = useTranslations('bookingSheets');
  const completionCopy = useTranslations('completion');
  const categories = useTranslations('helperCard.categories');
  const status = useBookingStatus(data.status, data.viewerRole);
  const { terms, checkIn, openChange } = data;
  const schedule = data.task.schedule;

  // On phones the actions float in a tray above the dock: the page keeps room for it (and the gap under it).
  return <div data-booking-hub className="mx-auto max-w-reading space-y-6 pb-[calc(var(--booking-actions-height,0px)+1rem)] lg:pb-0">
    <div className="space-y-3">
      <Link href={routes.app.bookings()} className={backLink}>
        <ArrowLeft aria-hidden="true" className={backArrow} />{t('back')}
      </Link>
      <PageHeader title={data.task.title} description={categories(data.task.categorySlug)}><StatusBadge {...status} /></PageHeader>
      {data.series && <Link href={routes.app.series(data.series.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
        <Repeat aria-hidden="true" className="size-4 shrink-0" />{t('seriesLink', { index: data.series.index, cadence: data.series.cadence })}
      </Link>}
      <BookingState data={data} now={now} tone={status.tone} />
    </div>

    {openChange && <section aria-label={t('change.title')} className={cn(surface, surfacePad, 'space-y-2 border-info/30 dark:border-info/35')}>
      <h2 className={sectionTitle}>{t('change.title')}</h2>
      <p className="tabular-nums">{openChange.status === 'proposed'
        ? t(openChange.fromMe ? 'change.proposedByYou' : 'change.proposedByOther', { name: data.viewerRole === 'poster' ? data.helper.displayName : data.poster.displayName })
        : data.viewerRole === 'helper'
          ? t('change.waitingForPayment', { name: data.poster.displayName })
          : openChange.differenceCents !== undefined
            ? t('change.payDifference', { amount: formatMoney(openChange.differenceCents) })
            : t('change.finishPayment')}</p>
      <Link href={routes.app.bookingChange(data.id, openChange.id)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('change.view')}</Link>
    </section>}

    {data.dispute && <BookingDisputeCard dispute={data.dispute} viewerRole={data.viewerRole} />}

    <ScheduledPaymentCard key={`scheduled-${data.id}`} data={data} handlers={scheduledPayment} preview={scheduledPreview} />

    <BookingHubActions key={data.id} data={data} handlers={handlers} sheets={sheets} initialResult={initialResult} initialPending={initialPending} />

    <BookingTipCard key={`tip-${data.id}`} data={data} handlers={tip} preview={tipPreview} />

    {data.myReview && <section aria-label={t('review.title')} className={cn(surface, surfacePad, 'space-y-3')}>
      <h2 className={sectionTitle}>{t('review.title')}</h2>
      <p className="font-medium tabular-nums">{t('review.rating', { rating: data.myReview.rating })}</p>
      <RatingStars rating={{ average: data.myReview.rating, count: 1 }} />
      <p className="text-sm text-muted-foreground">{data.myReview.publishedAt
        ? <time dateTime={data.myReview.publishedAt}>{t('review.visible', { date: formatDate(data.myReview.publishedAt) })}</time>
        : t('review.hidden')}</p>
    </section>}

    {data.completion && <section aria-label={t('work')} className="space-y-4">
      <h2 className={sectionTitle}>{t('work')}</h2>
      <CompletionSummary completion={data.completion} variant={data.viewerRole} showCost={false} />
    </section>}

    <section aria-label={t(data.viewerRole === 'poster' ? 'helper' : 'client')} className="space-y-3">
      <h2 className={sectionTitle}>{t(data.viewerRole === 'poster' ? 'helper' : 'client')}</h2>
      {data.viewerRole === 'poster' ? <HelperCard helper={data.helper} variant="compact" /> : <div className={cn(surface, surfacePad, 'space-y-4')}>
        <div className="flex items-center gap-3">
          <InitialsAvatar initials={data.poster.initials} photo={data.poster.photo} />
          <div className="min-w-0 space-y-1">
            <h3 className="break-words font-heading text-[17px]/6 font-semibold">{data.poster.displayName}</h3>
            <p className="text-sm text-muted-foreground">{t('memberSince', { date: formatMonthYear(data.poster.memberSince) })}</p>
          </div>
        </div>
        <VerificationBadges badges={{ phoneVerified: data.poster.phoneVerified }} compact />
      </div>}
    </section>

    <section aria-label={t('whenWhere')} className="space-y-4">
      <h2 className={sectionTitle}>{t('whenWhere')}</h2>
      <div className={cn(surface, surfacePad, 'space-y-5')}>
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
        <div className="border-t border-foreground/[0.07] pt-5 dark:border-white/[0.07]"><GeneralArea location={data.location} privacyNote={!(data.addressVisibility === 'visible' && data.exactAddress)} /></div>
        {data.addressVisibility !== 'visible' && <p className="flex items-start gap-2 rounded-2xl bg-muted/70 px-3.5 py-3 text-sm">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{t(`address.${data.addressVisibility}`)}</span>
        </p>}
      </div>
      {data.addressVisibility === 'visible' && data.exactAddress && <>
        <ExactAddressPanel
          address={data.exactAddress}
          mapsHref={routes.external.googleMapsSearch(data.exactAddress)}
          {...(data.viewerRole === 'helper' ? { directions: { google: routes.external.googleMapsDirections(data.exactAddress), apple: routes.external.appleMapsDirections(data.exactAddress) } } : {})}
        />
        {data.viewerRole === 'helper' && data.deadlines.addressHiddenAt && <p className="text-sm text-muted-foreground">
          <time dateTime={data.deadlines.addressHiddenAt}>{t('address.visible', { date: formatDateTime(data.deadlines.addressHiddenAt) })}</time>
        </p>}
      </>}
    </section>

    {checkIn && <section aria-label={t('checkIn')} className={cn(surface, surfacePad, 'space-y-4')}>
      <h2 className={sectionTitle}>{t('checkIn')}</h2>
      <ul className="space-y-3">
        {checkIn.onMyWayAt && <li className="flex items-start gap-3"><Navigation aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><time dateTime={checkIn.onMyWayAt} className="tabular-nums">{t('onMyWay', { time: formatTime(checkIn.onMyWayAt) })}</time></li>}
        {checkIn.lateByMinutes !== undefined && <li className="flex items-start gap-3"><Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" /><span className="tabular-nums">{t('runningLate', { minutes: checkIn.lateByMinutes })}</span></li>}
        {checkIn.arrivedAt && <li className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" /><time dateTime={checkIn.arrivedAt} className="tabular-nums">{t('arrived', { time: formatTime(checkIn.arrivedAt) })}</time></li>}
        {checkIn.cantAccessAt && <li className="flex items-start gap-3"><Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" /><time dateTime={checkIn.cantAccessAt} className="tabular-nums">{sheetCopy('cantAccessAt', { helper: data.helper.displayName, time: formatTime(checkIn.cantAccessAt) })}</time></li>}
      </ul>
      {!checkIn.onMyWayAt && checkIn.lateByMinutes === undefined && !checkIn.arrivedAt && !checkIn.cantAccessAt && <p className="text-sm text-muted-foreground">{t('noCheckIn')}</p>}
    </section>}

    <section aria-label={t('terms')} className="space-y-4">
      <h2 className={sectionTitle}>{t('terms')}</h2>
      <div className={cn(surface, surfacePad, 'space-y-5')}>
        <div className="space-y-2"><h3 className="font-semibold">{t('scope')}</h3><p className="whitespace-pre-wrap break-words">{terms.scopeText}</p></div>
        <div className="space-y-2"><h3 className="font-semibold">{t('allowance')}</h3>{terms.expenseAllowance ? <>
          <p className="font-medium tabular-nums">{formatMoney(terms.expenseAllowance.amountCents)}</p>
          <p className="break-words text-sm text-muted-foreground">{terms.expenseAllowance.description}</p>
        </> : <p className="text-sm text-muted-foreground">{t('noAllowance')}</p>}</div>
      </div>
      {/* The money once (audit M29): the agreed price, the final cost once the work is in (else the agreed breakdown),
          and for the client the card charged and its status, in one card. */}
      <div className={cn(surface, surfacePad, 'space-y-4')}>
        <p className="text-sm text-muted-foreground tabular-nums"><span className="font-medium text-foreground">{t('pricing')}:</span> {terms.pricing.type === 'fixed'
          ? t('fixedPrice', { amount: formatMoney(terms.pricing.priceCents) })
          : t('hourlyPrice', { rate: formatMoney(terms.pricing.rateCents), estimate: formatHours(terms.pricing.estimatedHours), cap: formatHours(terms.pricing.hoursCap) })}</p>
        {data.completion
          ? <PriceBreakdown flat headingLevel={3} breakdown={data.completion.finalBreakdown} variant={data.viewerRole} title={completionCopy(data.viewerRole === 'poster' ? 'finalCost' : 'earnings')} />
          : <PriceBreakdown flat headingLevel={3} breakdown={terms.breakdown} variant={data.viewerRole} posterTotalLabel={t(data.status === 'pending_funding' ? 'totalDue' : 'totalCharged')} />}
        {data.viewerRole === 'poster' && terms.pricing.type === 'hourly' && <p className={note}>{t('hourlyNote', { hours: terms.pricing.hoursCap })}</p>}
        {data.viewerRole === 'poster' && data.payments && <section aria-label={t('payments')} className="space-y-3 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.07]">
          <h3 className="font-heading text-[1.0625rem]/6 font-semibold tracking-[-0.01em]">{t('payments')}</h3>
          {data.payments.length > 0 ? <ul className="divide-y divide-foreground/[0.07] dark:divide-white/[0.07]">{data.payments.map((payment) => <BookingPayment key={payment.id} payment={payment} />)}</ul> : <p className="text-sm text-muted-foreground">{t('noPayments')}</p>}
        </section>}
      </div>
    </section>

    <div className={cn(surface, surfacePad)}><Timeline events={data.timeline} collapsible /></div>

    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <HelpCircle aria-hidden="true" className="mt-1 size-5 shrink-0" />
      <div><p>{t('helpLine')}</p><Link href={routes.help()} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4">{t('help')}</Link></div>
    </div>
  </div>;
}
