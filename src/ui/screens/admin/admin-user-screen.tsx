import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { routes, type AdminUserHandlers, type AdminUserPageData, type BadgeTone, type DeliveryStatus, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { AdminCaseRows } from './admin-case-rows';
import { AdminStrikeReversal } from './admin-strike-controls';
import { AdminRewardList } from './admin-reward-list';
import { AdminVerificationSection } from './admin-verification-section';
import { AdminUserControls, type AdminUserPreviewState } from './admin-user-controls';
import { AdminHelperBadge, AdminUserRoles } from './admin-user-summary';
import { AdminBackLink, adminCard, adminH2, adminMoneyTd, adminNote, adminPanel, adminSection, adminTableFrame, adminTd, adminTh, adminTr } from './admin-ui';
import { cn } from '@/ui/lib/utils';

export interface AdminUserScreenProps { data: AdminUserPageData; handlers: AdminUserHandlers; now: ISODateTime }

function BookingRow({ booking, now, mobile = false }: { booking: AdminUserPageData['bookings'][number]; now: ISODateTime; mobile?: boolean }) {
  const { formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminUser');
  const status = useBookingStatus(booking.status, 'staff');
  const title = <Link href={routes.admin.booking(booking.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md py-2 font-semibold text-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline">{booking.title}</Link>;
  const time = <time dateTime={booking.start} title={formatRelative(booking.start, now)}>{formatDateTime(booking.start)}</time>;
  if (mobile) return <li className={cn(adminCard, 'space-y-3')}>
    {title}<div><StatusBadge {...status} /></div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">{t('role')}</dt><dd>{t(`bookingRoles.${booking.role}`)}</dd></div><div><dt className="text-muted-foreground">{t('amount')}</dt><dd className="font-semibold tabular-nums">{formatMoney(booking.amountCents)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">{t('start')}</dt><dd className="tabular-nums">{time}</dd></div></dl>
  </li>;
  return <tr className={adminTr}><th scope="row" className={cn(adminTd, 'text-left font-normal')}>{title}</th><td className={adminTd}>{t(`bookingRoles.${booking.role}`)}</td><td className={adminTd}><StatusBadge {...status} /></td><td className={cn(adminTd, 'tabular-nums text-muted-foreground')}>{time}</td><td className={adminMoneyTd}>{formatMoney(booking.amountCents)}</td></tr>;
}

const deliveryTones: Record<DeliveryStatus, BadgeTone> = { sending: 'info', sent: 'success', held: 'warning', failed: 'danger', skipped: 'neutral' };

/** One email or text: what it was about, what happened, and when it's tried next. */
function DeliveryRow({ delivery, now }: { delivery: AdminUserPageData['deliveries'][number]; now: ISODateTime }) {
  const { formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminUser');
  const reason = delivery.reason ? (t.has(`deliveryReasons.${delivery.reason}`) ? t(`deliveryReasons.${delivery.reason}`) : delivery.reason) : undefined;
  return <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
    <div className="min-w-0 space-y-2">
      <p className="break-words text-sm font-medium">{t('deliveryLine', { channel: t(`deliveryChannels.${delivery.channel}`), type: t(`deliveryTypes.${delivery.type}`) })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={deliveryTones[delivery.status]} label={t(`deliveryStatuses.${delivery.status}`)} />
        {delivery.attempts > 1 && <span className="text-sm text-muted-foreground">{t('deliveryAttempts', { count: delivery.attempts })}</span>}
      </div>
      {reason && <p className="break-words text-sm text-muted-foreground">{reason}</p>}
      {delivery.nextTryAt && <p className="text-sm text-muted-foreground"><time dateTime={delivery.nextTryAt}>{t('deliveryNextTry', { time: formatDateTime(delivery.nextTryAt) })}</time></p>}
    </div>
    <time dateTime={delivery.at} title={formatRelative(delivery.at, now)} className="text-sm tabular-nums text-muted-foreground">{formatDateTime(delivery.at)}</time>
  </li>;
}

export function AdminUserScreen(props: AdminUserScreenProps) { return <AdminUserContent {...props} />; }

/** Preview seeds are separate from the application screen's contract. */
export function AdminUserContent({ data, handlers, now, ...previewState }: AdminUserScreenProps & AdminUserPreviewState) {
  const { formatDateTime, formatMonthYear, formatRelative } = useFormat();
  const t = useTranslations('adminUser');
  const { user } = data;
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <nav aria-label={t('breadcrumbs')}><AdminBackLink href={routes.admin.users()}>{t('back')}</AdminBackLink></nav>
    <header className={cn(adminSection, 'space-y-4')}>
      <div className="flex items-center gap-4"><InitialsAvatar initials={user.person.initials} size="lg" /><div className="min-w-0 space-y-1"><p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('person')}</p><h1 className="font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.125rem]">{user.person.displayName}</h1><p className="text-sm text-muted-foreground"><time dateTime={user.person.memberSince}>{t('memberSince', { date: formatMonthYear(user.person.memberSince) })}</time></p></div></div>
      <dl className="grid gap-4 border-t border-foreground/[0.07] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-white/[0.07]">
        <div className="space-y-1"><dt className="text-muted-foreground">{t('email')}</dt><dd className="break-all">{user.email}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('phone')}</dt><dd className="tabular-nums">{user.phone ? t(user.phone.verified ? 'phoneVerified' : 'phoneUnverified', { last4: user.phone.last4 }) : t('phoneMissing')}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('roles')}</dt><dd><AdminUserRoles roles={user.roles} /></dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('helperStatus')}</dt><dd><AdminHelperBadge status={user.helperStatus} /></dd></div>
      </dl>
    </header>
    {data.suspension && <section aria-label={t('suspension.title')} className={cn(adminSection, 'space-y-3 border-destructive/30 bg-destructive/[0.03] dark:border-destructive/40 dark:bg-destructive/[0.06]')}>
      <h2 className={cn(adminH2, 'flex items-center gap-2')}><ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />{t('suspension.title')}</h2>
      <p className="whitespace-pre-wrap text-sm">{data.suspension.reason}</p>
      <p className="text-sm text-muted-foreground">{t('suspension.by', { name: data.suspension.byDisplayName })}</p>
      <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={data.suspension.at} title={formatRelative(data.suspension.at, now)}>{t('suspension.at', { date: formatDateTime(data.suspension.at) })}</time></p>
    </section>}
    <AdminUserControls key={user.id} data={data} handlers={handlers} {...previewState} />
    <AdminVerificationSection userId={user.id} verification={data.verification} handlers={handlers} now={now} />
    <section aria-label={t('bookings')} className="space-y-3">
      <h2 className={adminH2}>{t('bookings')}</h2>
      {data.bookings.length === 0 ? <p className={adminNote}>{t('noBookings')}</p> : <>
        <div className={adminTableFrame}><table className="w-full table-fixed text-sm"><caption className="sr-only">{t('bookingsCaption')}</caption><thead><tr>{(['booking', 'role', 'status', 'start', 'amount'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, column === 'booking' ? 'w-[32%]' : column === 'status' || column === 'start' ? 'w-[22%]' : column === 'amount' ? 'w-[12%] text-right' : 'w-[12%]')}>{t(column)}</th>)}</tr></thead><tbody>{data.bookings.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} />)}</tbody></table></div>
        <ul className="space-y-3 lg:hidden">{data.bookings.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} mobile />)}</ul>
      </>}
    </section>
    <section aria-label={t('cases')} className="space-y-3">
      <h2 className={adminH2}>{t('cases')}</h2>
      {data.cases.length === 0 ? <p className={adminNote}>{t('noCases')}</p> : <AdminCaseRows items={data.cases} now={now} caption={t('casesCaption')} />}
    </section>
    <section aria-label={t('rewards')} className="space-y-3">
      <div><h2 className={adminH2}>{t('rewards')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('rewardsHint')}</p><Link href={routes.admin.rewards()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">{t('reviewRewards')}</Link></div>
      {data.rewards.length === 0 ? <p className={adminNote}>{t('noRewards')}</p> : <AdminRewardList rows={data.rewards} now={now} />}
    </section>
    <section aria-label={t('strikes')} className="space-y-3">
      <h2 className={adminH2}>{t('strikes')}</h2>
      {data.strikes.length === 0 ? <p className={adminNote}>{t('noStrikes')}</p> : <ul className={cn(adminPanel, 'divide-y divide-foreground/[0.07] px-4 sm:px-5 dark:divide-white/[0.07]')}>{data.strikes.map((strike) => {
        const label = t.has(`strikeReasons.${strike.reason}`) ? t(`strikeReasons.${strike.reason}`) : strike.reason;
        return <li key={strike.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1">
            <p className={strike.reversedAt ? 'text-sm font-medium text-muted-foreground line-through' : 'text-sm font-medium'}>{label}</p>
            {strike.reversedAt && <p className="text-sm text-muted-foreground"><time dateTime={strike.reversedAt}>{t('strikeReversed', { date: formatDateTime(strike.reversedAt) })}</time></p>}
            <Link href={routes.admin.booking(strike.bookingId)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('strikeBooking', { id: strike.bookingId })}</Link>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <time dateTime={strike.at} title={formatRelative(strike.at, now)} className="text-sm tabular-nums text-muted-foreground">{formatDateTime(strike.at)}</time>
            {data.canReverseStrikes && !strike.reversedAt && <AdminStrikeReversal strikeId={strike.id} label={label} handlers={handlers} initialOpen={previewState.initialStrikeDialog === strike.id} />}
          </div>
        </li>;
      })}</ul>}
    </section>
    <section aria-label={t('deliveries')} className="space-y-3">
      <div><h2 className={adminH2}>{t('deliveries')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('deliveriesHint')}</p></div>
      {data.deliveries.length === 0 ? <p className={adminNote}>{t('noDeliveries')}</p> : <ul className={cn(adminPanel, 'divide-y divide-foreground/[0.07] px-4 sm:px-5 dark:divide-white/[0.07]')}>{data.deliveries.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} now={now} />)}</ul>}
    </section>
  </div>;
}
