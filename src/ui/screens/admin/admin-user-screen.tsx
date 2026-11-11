import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { routes, type AdminCaseRow, type AdminUserHandlers, type AdminUserPageData, type ISODateTime } from '@/contracts';
import { formatDateTime, formatMoney, formatMonthYear, formatRelative } from '@/shared/format';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, useCaseStatus } from '@/ui/components/status/use-status';
import { AdminResponseTarget } from './admin-response-target';
import { AdminRewardList } from './admin-reward-list';
import { AdminUserControls, type AdminUserPreviewState } from './admin-user-controls';
import { AdminHelperBadge, AdminUserRoles } from './admin-user-summary';

export interface AdminUserScreenProps { data: AdminUserPageData; handlers: AdminUserHandlers; now: ISODateTime }

function BookingRow({ booking, now, mobile = false }: { booking: AdminUserPageData['bookings'][number]; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminUser');
  const status = useBookingStatus(booking.status, 'staff');
  const title = <Link href={routes.admin.booking(booking.id)} className="inline-flex min-h-11 items-center rounded-md py-2 font-semibold text-primary underline-offset-4 hover:underline">{booking.title}</Link>;
  const time = <time dateTime={booking.start} title={formatRelative(booking.start, now)}>{formatDateTime(booking.start)}</time>;
  if (mobile) return <li className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
    {title}<div><StatusBadge {...status} /></div>
    <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">{t('role')}</dt><dd>{t(`bookingRoles.${booking.role}`)}</dd></div><div><dt className="text-muted-foreground">{t('amount')}</dt><dd className="font-semibold tabular-nums">{formatMoney(booking.amountCents)}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">{t('start')}</dt><dd className="tabular-nums">{time}</dd></div></dl>
  </li>;
  return <tr className="border-t align-top hover:bg-accent/50"><th scope="row" className="p-3 text-left font-normal">{title}</th><td className="p-3">{t(`bookingRoles.${booking.role}`)}</td><td className="p-3"><StatusBadge {...status} /></td><td className="p-3 tabular-nums">{time}</td><td className="p-3 font-semibold tabular-nums">{formatMoney(booking.amountCents)}</td></tr>;
}

function CaseRow({ item, now, mobile = false }: { item: AdminCaseRow; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  const summary = <div className="space-y-1">
    <p className="text-sm text-muted-foreground">{t(`types.${item.type}`)}{' · '}{t('priority', { priority: t(`priorities.${item.priority}`) })}</p>
    <Link href={routes.admin.case(item.id)} className="inline-flex min-h-11 items-center rounded-md py-2 font-semibold text-primary underline-offset-4 hover:underline">{item.subject}</Link>
    {item.awaitingReply && <p className="text-sm font-medium text-primary">{t('newReply')}</p>}
  </div>;
  const target = <AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} />;
  if (mobile) return <li className="space-y-3 rounded-xl border bg-card p-4 shadow-card">{summary}<StatusBadge {...status} /><dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm"><div><dt className="text-muted-foreground">{t('columns.openedBy')}</dt><dd>{item.openedBy.displayName}</dd></div><div><dt className="text-muted-foreground">{t('columns.assignee')}</dt><dd>{item.assignee?.displayName ?? t('unassigned')}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">{t('columns.response')}</dt><dd>{target}</dd></div></dl></li>;
  return <tr className="border-t align-top hover:bg-accent/50"><th scope="row" className="p-3 text-left font-normal">{summary}</th><td className="p-3">{item.openedBy.displayName}</td><td className="p-3"><StatusBadge {...status} /></td><td className="p-3">{target}</td><td className="p-3">{item.assignee?.displayName ?? t('unassigned')}</td></tr>;
}

export function AdminUserScreen(props: AdminUserScreenProps) { return <AdminUserContent {...props} />; }

/** Preview seeds are separate from the application screen's contract. */
export function AdminUserContent({ data, handlers, now, ...previewState }: AdminUserScreenProps & AdminUserPreviewState) {
  const t = useTranslations('adminUser');
  const cases = useTranslations('adminCases');
  const { user } = data;
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <nav aria-label={t('breadcrumbs')}><Link href={routes.admin.users()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('back')}</Link></nav>
    <header className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-4"><InitialsAvatar initials={user.person.initials} size="lg" /><div className="min-w-0 space-y-1"><p className="text-sm text-muted-foreground">{t('person')}</p><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{user.person.displayName}</h1><p className="text-sm text-muted-foreground"><time dateTime={user.person.memberSince}>{t('memberSince', { date: formatMonthYear(user.person.memberSince) })}</time></p></div></div>
      <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><dt className="text-muted-foreground">{t('email')}</dt><dd>{user.email}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('phone')}</dt><dd className="tabular-nums">{user.phone ? t(user.phone.verified ? 'phoneVerified' : 'phoneUnverified', { last4: user.phone.last4 }) : t('phoneMissing')}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('roles')}</dt><dd><AdminUserRoles roles={user.roles} /></dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">{t('helperStatus')}</dt><dd><AdminHelperBadge status={user.helperStatus} /></dd></div>
      </dl>
    </header>
    {data.suspension && <section aria-label={t('suspension.title')} className="space-y-3 rounded-xl border border-destructive/30 bg-card p-4 shadow-card sm:p-5">
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />{t('suspension.title')}</h2>
      <p className="whitespace-pre-wrap text-sm">{data.suspension.reason}</p>
      <p className="text-sm text-muted-foreground">{t('suspension.by', { name: data.suspension.byDisplayName })}</p>
      <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={data.suspension.at} title={formatRelative(data.suspension.at, now)}>{t('suspension.at', { date: formatDateTime(data.suspension.at) })}</time></p>
    </section>}
    <AdminUserControls key={user.id} data={data} handlers={handlers} {...previewState} />
    <section aria-label={t('bookings')} className="space-y-3">
      <h2 className="font-heading text-xl font-semibold">{t('bookings')}</h2>
      {data.bookings.length === 0 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t('noBookings')}</p> : <>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm"><caption className="sr-only">{t('bookingsCaption')}</caption><thead className="text-left text-muted-foreground"><tr>{(['booking', 'role', 'status', 'start', 'amount'] as const).map((column) => <th key={column} scope="col" className={column === 'booking' ? 'w-[32%] p-3 font-medium' : column === 'status' || column === 'start' ? 'w-[22%] p-3 font-medium' : 'w-[12%] p-3 font-medium'}>{t(column)}</th>)}</tr></thead><tbody>{data.bookings.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} />)}</tbody></table></div>
        <ul className="space-y-3 lg:hidden">{data.bookings.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} mobile />)}</ul>
      </>}
    </section>
    <section aria-label={t('cases')} className="space-y-3">
      <h2 className="font-heading text-xl font-semibold">{t('cases')}</h2>
      {data.cases.length === 0 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t('noCases')}</p> : <>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm"><caption className="sr-only">{t('casesCaption')}</caption><thead className="text-left text-muted-foreground"><tr>{(['case', 'openedBy', 'status', 'response', 'assignee'] as const).map((column) => <th key={column} scope="col" className={column === 'case' ? 'w-[30%] p-3 font-medium' : column === 'response' ? 'w-[23%] p-3 font-medium' : column === 'status' ? 'w-[19%] p-3 font-medium' : 'w-[14%] p-3 font-medium'}>{cases(`columns.${column}`)}</th>)}</tr></thead><tbody>{data.cases.map((item) => <CaseRow key={item.id} item={item} now={now} />)}</tbody></table></div>
        <ul className="space-y-3 lg:hidden">{data.cases.map((item) => <CaseRow key={item.id} item={item} now={now} mobile />)}</ul>
      </>}
    </section>
    <section aria-label={t('rewards')} className="space-y-3">
      <div><h2 className="font-heading text-xl font-semibold">{t('rewards')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('rewardsHint')}</p><Link href={routes.admin.rewards()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('reviewRewards')}</Link></div>
      {data.rewards.length === 0 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t('noRewards')}</p> : <AdminRewardList rows={data.rewards} now={now} />}
    </section>
    <section aria-label={t('strikes')} className="space-y-3">
      <h2 className="font-heading text-xl font-semibold">{t('strikes')}</h2>
      {data.strikes.length === 0 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t('noStrikes')}</p> : <ul className="divide-y rounded-xl border bg-card px-4 shadow-card sm:px-5">{data.strikes.map((strike) => <li key={strike.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div><p className="text-sm font-medium">{t.has(`strikeReasons.${strike.reason}`) ? t(`strikeReasons.${strike.reason}`) : strike.reason}</p><Link href={routes.admin.booking(strike.bookingId)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('strikeBooking', { id: strike.bookingId })}</Link></div>
        <time dateTime={strike.at} title={formatRelative(strike.at, now)} className="text-sm tabular-nums text-muted-foreground">{formatDateTime(strike.at)}</time>
      </li>)}</ul>}
    </section>
  </div>;
}
