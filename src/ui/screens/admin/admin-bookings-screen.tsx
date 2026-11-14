import { useId } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_BOOKING_FILTERS, routes, type AdminBookingFlag, type AdminBookingRow, type AdminBookingsPageData, type BadgeTone, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { AdminFilterChip, adminCard, adminMoneyTd, adminSection, adminTableFrame, adminTd, adminTh, adminTr, AdminWhen } from './admin-ui';

export interface AdminBookingsScreenProps { data: AdminBookingsPageData; now: ISODateTime }

const flagTones: Record<AdminBookingFlag, BadgeTone> = { disputed: 'danger', open_case: 'warning', approval_overdue: 'warning', funds_held: 'warning', payment_failed: 'danger', refund_approval: 'warning' };

function Flags({ flags }: { flags: AdminBookingFlag[] }) {
  const t = useTranslations('adminBookings');
  if (flags.length === 0) return null;
  return <ul aria-label={t('flagsLabel')} className="flex flex-wrap gap-1.5">{flags.map((flag) => <li key={flag}><StatusBadge tone={flagTones[flag]} label={t(`flags.${flag}`)} /></li>)}</ul>;
}

function People({ row }: { row: AdminBookingRow }) {
  const t = useTranslations('adminBookings');
  const person = (label: string, id: string, name: string) => <span className="block"><span className="text-muted-foreground">{label}{' '}</span><Link href={routes.admin.user(id)} className="inline-flex min-h-11 items-center rounded-md font-medium underline-offset-4 hover:text-primary hover:underline sm:min-h-6">{name}</Link></span>;
  return <span className="block space-y-0.5 text-sm">{person(t('client'), row.client.id, row.client.displayName)}{person(t('helper'), row.helper.id, row.helper.displayName)}</span>;
}

function BookingRow({ row, now, mobile = false }: { row: AdminBookingRow; now: ISODateTime; mobile?: boolean }) {
  const { formatRelative } = useFormat();
  const t = useTranslations('adminBookings');
  const categories = useTranslations('helperCard.categories');
  const status = useBookingStatus(row.status, 'staff');
  const title = <div className="min-w-0 space-y-0.5">
    <Link href={routes.admin.booking(row.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md py-1 font-semibold text-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline">{row.title}</Link>
    <p className="text-sm text-muted-foreground">{categories(row.categorySlug)}{' · '}<span className="font-mono text-xs tabular-nums">{row.id}</span></p>
  </div>;
  const start = <AdminWhen at={row.start} title={formatRelative(row.start, now)} />;
  if (mobile) return <li className={cn(adminCard, 'space-y-3')}>
    <div className="flex items-start justify-between gap-3">{title}<dl className="shrink-0 pt-2"><dt className="sr-only">{t('columns.total')}</dt><dd className="text-lg font-semibold tabular-nums">{formatMoney(row.totalCents)}</dd></dl></div>
    <div className="flex flex-wrap gap-1.5"><StatusBadge {...status} /></div>
    <Flags flags={row.flags} />
    <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]">
      <div className="col-span-2"><dt className="sr-only">{t('columns.people')}</dt><dd><People row={row} /></dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.start')}</dt><dd className="tabular-nums">{start}</dd></div>
    </dl>
  </li>;
  return <tr className={adminTr}>
    <th scope="row" className={cn(adminTd, 'text-left font-normal')}>{title}</th>
    <td className={adminTd}><People row={row} /></td>
    <td className={adminTd}><StatusBadge {...status} /></td>
    <td className={cn(adminTd, 'tabular-nums')}>{start}</td>
    <td className={adminMoneyTd}>{formatMoney(row.totalCents)}</td>
    <td className={adminTd}><Flags flags={row.flags} /></td>
  </tr>;
}

const WIDTHS = { task: 'w-[22%]', people: 'w-[18%]', status: 'w-[17%]', start: 'w-[13%]', total: 'w-[10%] text-right', flags: 'w-[20%]' } as const;

/** Staff: every booking, what needs attention first, a search (UI-033). */
export function AdminBookingsScreen({ data, now }: AdminBookingsScreenProps) {
  const t = useTranslations('adminBookings');
  const id = useId();
  const total = data.counts[data.filter];
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <form method="get" action={routes.admin.bookings()} role="search" aria-label={t('search')} className={cn(adminSection, 'space-y-2')}>
      <input type="hidden" name="filter" value={data.filter} />
      <Label htmlFor={`${id}-search`}>{t('search')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input key={data.query} id={`${id}-search`} name="q" type="search" defaultValue={data.query} aria-describedby={`${id}-hint`} className="min-w-0 flex-1" /><Button type="submit"><Search aria-hidden="true" className="size-4" />{t('submitSearch')}</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p>
        {data.query && <Link href={routes.admin.bookings({ filter: data.filter })} className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline"><X aria-hidden="true" className="size-4" />{t('clearSearch')}</Link>}
      </div>
    </form>
    <nav aria-label={t('filtersLabel')}>
      <ul className="flex flex-wrap gap-2">{ADMIN_BOOKING_FILTERS.map((filter) => <li key={filter}>
        <AdminFilterChip href={routes.admin.bookings({ filter, q: data.query || undefined })} current={filter === data.filter} count={data.counts[filter]}>{t(`filters.${filter}`)}</AdminFilterChip>
      </li>)}</ul>
    </nav>
    <section aria-label={t('results')} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {data.query && <p className="font-medium">{t('searching', { query: data.query })}</p>}
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: total })}</p>
        {total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length, count: total })}</p>}
      </div>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={data.filter === 'attention' && !data.query ? t('emptyAttention') : t('emptyBody')} /> : <>
        <div className={adminTableFrame}><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead><tr>{(['task', 'people', 'status', 'start', 'total', 'flags'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, WIDTHS[column])}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <BookingRow key={row.id} row={row} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.rows.map((row) => <BookingRow key={row.id} row={row} now={now} mobile />)}</ul>
      </>}
    </section>
  </div>;
}
