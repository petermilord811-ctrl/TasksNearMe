import { useId } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_BOOKING_FILTERS, routes, type AdminBookingFlag, type AdminBookingRow, type AdminBookingsPageData, type BadgeTone, type ISODateTime } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';

export interface AdminBookingsScreenProps { data: AdminBookingsPageData; now: ISODateTime }

const flagTones: Record<AdminBookingFlag, BadgeTone> = { disputed: 'danger', open_case: 'warning', approval_overdue: 'warning', funds_held: 'warning', payment_failed: 'danger' };

function Flags({ flags }: { flags: AdminBookingFlag[] }) {
  const t = useTranslations('adminBookings');
  if (flags.length === 0) return null;
  return <ul aria-label={t('flagsLabel')} className="flex flex-wrap gap-1.5">{flags.map((flag) => <li key={flag}><StatusBadge tone={flagTones[flag]} label={t(`flags.${flag}`)} /></li>)}</ul>;
}

function People({ row }: { row: AdminBookingRow }) {
  const t = useTranslations('adminBookings');
  const person = (label: string, id: string, name: string) => <span className="block"><span className="text-muted-foreground">{label}{' '}</span><Link href={routes.admin.user(id)} className="inline-flex min-h-11 items-center rounded-md font-medium underline-offset-4 hover:underline sm:min-h-0">{name}</Link></span>;
  return <span className="block space-y-0.5 text-sm">{person(t('client'), row.client.id, row.client.displayName)}{person(t('helper'), row.helper.id, row.helper.displayName)}</span>;
}

function BookingRow({ row, now, mobile = false }: { row: AdminBookingRow; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminBookings');
  const categories = useTranslations('helperCard.categories');
  const status = useBookingStatus(row.status, 'staff');
  const title = <div className="space-y-1">
    <Link href={routes.admin.booking(row.id)} className="inline-flex min-h-11 items-center rounded-md py-1 font-semibold text-primary underline-offset-4 hover:underline">{row.title}</Link>
    <p className="text-sm text-muted-foreground">{categories(row.categorySlug)}{' · '}<span className="tabular-nums">{row.id}</span></p>
  </div>;
  const start = <time dateTime={row.start} title={formatRelative(row.start, now)}>{formatDateTime(row.start)}</time>;
  if (mobile) return <li className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-card">
    {title}
    <div className="flex flex-wrap gap-1.5"><StatusBadge {...status} /></div>
    <Flags flags={row.flags} />
    <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
      <div className="col-span-2"><dt className="sr-only">{t('columns.people')}</dt><dd><People row={row} /></dd></div>
      <div><dt className="text-muted-foreground">{t('columns.start')}</dt><dd className="tabular-nums">{start}</dd></div>
      <div><dt className="text-muted-foreground">{t('columns.total')}</dt><dd className="font-semibold tabular-nums">{formatMoney(row.totalCents)}</dd></div>
    </dl>
  </li>;
  return <tr className="border-t align-top hover:bg-accent/50">
    <th scope="row" className="p-3 text-left font-normal">{title}</th>
    <td className="p-3"><People row={row} /></td>
    <td className="p-3"><StatusBadge {...status} /></td>
    <td className="p-3 tabular-nums">{start}</td>
    <td className="p-3 font-semibold tabular-nums">{formatMoney(row.totalCents)}</td>
    <td className="p-3"><Flags flags={row.flags} /></td>
  </tr>;
}

/** Staff: every booking, what needs attention first, a search (UI-033). */
export function AdminBookingsScreen({ data, now }: AdminBookingsScreenProps) {
  const t = useTranslations('adminBookings');
  const id = useId();
  const total = data.counts[data.filter];
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="text-muted-foreground">{t('intro')}</p></header>
    <form method="get" action={routes.admin.bookings()} role="search" aria-label={t('search')} className="space-y-2 rounded-xl border bg-card p-4 shadow-card">
      <input type="hidden" name="filter" value={data.filter} />
      <Label htmlFor={`${id}-search`}>{t('search')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input key={data.query} id={`${id}-search`} name="q" type="search" defaultValue={data.query} aria-describedby={`${id}-hint`} className="min-w-0 flex-1" /><Button type="submit"><Search aria-hidden="true" className="size-4" />{t('submitSearch')}</Button></div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p>
      {data.query && <Link href={routes.admin.bookings({ filter: data.filter })} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('clearSearch')}</Link>}
    </form>
    <nav aria-label={t('filtersLabel')}>
      <ul className="flex flex-wrap gap-2">{ADMIN_BOOKING_FILTERS.map((filter) => {
        const current = filter === data.filter;
        return <li key={filter}><Link href={routes.admin.bookings({ filter, q: data.query || undefined })} aria-current={current ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors', current ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
          {t(`filters.${filter}`)}<span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', current ? 'bg-primary-foreground/20' : 'bg-muted')}>{data.counts[filter]}</span>
        </Link></li>;
      })}</ul>
    </nav>
    <section aria-label={t('results')} className="space-y-3">
      <div className="space-y-1">
        {data.query && <p className="font-medium">{t('searching', { query: data.query })}</p>}
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: total })}</p>
        {total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length, count: total })}</p>}
      </div>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={data.filter === 'attention' && !data.query ? t('emptyAttention') : t('emptyBody')} /> : <>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="text-left text-muted-foreground"><tr>{(['task', 'people', 'status', 'start', 'total', 'flags'] as const).map((column) => <th key={column} scope="col" className={column === 'task' ? 'w-[24%] p-3 font-medium' : column === 'people' ? 'w-[20%] p-3 font-medium' : column === 'flags' ? 'w-[18%] p-3 font-medium' : column === 'total' ? 'w-[10%] p-3 font-medium' : 'w-[14%] p-3 font-medium'}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <BookingRow key={row.id} row={row} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.rows.map((row) => <BookingRow key={row.id} row={row} now={now} mobile />)}</ul>
      </>}
    </section>
  </div>;
}
