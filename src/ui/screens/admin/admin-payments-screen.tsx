import { useId } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_MONEY_TABS, routes, type AdminMoneyRow, type AdminPaymentsPageData, type BadgeTone, type ISODateTime } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import messages from '../../../../messages/en/ui/adminPayments.json';

export interface AdminPaymentsScreenProps { data: AdminPaymentsPageData; now: ISODateTime }

const goodStatuses = new Set(['succeeded', 'paid', 'paid_out', 'transferred']);
const badStatuses = new Set(['failed', 'chargeback_open', 'chargeback_lost']);
const toneOf = (status: string): BadgeTone => (badStatuses.has(status) ? 'danger' : goodStatuses.has(status) ? 'success' : status === 'pending' || status === 'processing' || status === 'in_transit' || status === 'scheduled' ? 'info' : 'neutral');
type StatusKey = keyof typeof messages.statuses;
type DetailKey = keyof typeof messages.details;

function Row({ row, now, mobile = false }: { row: AdminMoneyRow; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminPayments');
  const status = row.status in messages.statuses ? t(`statuses.${row.status as StatusKey}`) : row.status;
  const detail = row.kind === 'payout' && row.detail ? t('bank', { last4: row.detail }) : row.detail && row.detail in messages.details ? t(`details.${row.detail as DetailKey}`) : row.detail;
  const what = <div className="space-y-1">
    <p className="font-semibold">{t(`kinds.${row.kind}`)}{detail && <span className="font-normal text-muted-foreground">{' · '}{detail}</span>}</p>
    {row.booking && <Link href={routes.admin.booking(row.booking.id)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">{row.booking.title}</Link>}
    {row.exception && <div className="space-y-1"><StatusBadge tone="warning" label={t(`exceptions.${row.exception}`)} /><p className="text-sm text-muted-foreground">{t(`exceptionHelp.${row.exception}`)}</p></div>}
  </div>;
  const person = <Link href={routes.admin.user(row.person.id)} className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline">{row.person.displayName}</Link>;
  const when = <time dateTime={row.at} title={formatRelative(row.at, now)}>{formatDateTime(row.at)}</time>;
  const reference = row.reference ? <code className="text-xs break-all text-muted-foreground">{row.reference}</code> : null;
  if (mobile) return <li className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-card">
    <div className="flex flex-wrap items-start justify-between gap-2">{what}<p className="text-lg font-semibold tabular-nums">{formatMoney(row.amountCents)}</p></div>
    <StatusBadge tone={toneOf(row.status)} label={status} />
    <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
      <div><dt className="text-muted-foreground">{t('columns.person')}</dt><dd>{person}</dd></div>
      <div><dt className="text-muted-foreground">{t('columns.when')}</dt><dd className="tabular-nums">{when}</dd></div>
      {reference && <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.reference')}</dt><dd>{reference}</dd></div>}
    </dl>
  </li>;
  return <tr className="border-t align-top hover:bg-accent/50">
    <th scope="row" className="p-3 text-left font-normal">{what}</th>
    <td className="p-3">{person}</td>
    <td className="p-3 font-semibold tabular-nums">{formatMoney(row.amountCents)}</td>
    <td className="p-3"><StatusBadge tone={toneOf(row.status)} label={status} /></td>
    <td className="p-3 tabular-nums">{when}</td>
    <td className="p-3">{reference}</td>
  </tr>;
}

/** Staff: charges, refunds, transfers and payouts, and what doesn't add up (UI-034). */
export function AdminPaymentsScreen({ data, now }: AdminPaymentsScreenProps) {
  const t = useTranslations('adminPayments');
  const id = useId();
  const total = data.counts[data.tab];
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <header className="space-y-2"><h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1><p className="text-muted-foreground">{t('intro')}</p></header>
    <section aria-labelledby={`${id}-totals`} className="space-y-3">
      <h2 id={`${id}-totals`} className="font-heading text-lg font-semibold">{t('totalsTitle')}</h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([['charged', data.totals.chargedCents], ['refunded', data.totals.refundedCents], ['transferred', data.totals.transferredCents], ['paidOut', data.totals.paidOutCents]] as const).map(([key, cents]) => <div key={key} className="space-y-1 rounded-xl border bg-card p-4 shadow-card"><dt className="text-sm text-muted-foreground">{t(`totals.${key}`)}</dt><dd className="text-xl font-semibold tabular-nums">{formatMoney(cents)}</dd></div>)}</dl>
    </section>
    <form method="get" action={routes.admin.payments()} role="search" aria-label={t('search')} className="space-y-2 rounded-xl border bg-card p-4 shadow-card">
      <input type="hidden" name="tab" value={data.tab} />
      <Label htmlFor={`${id}-search`}>{t('search')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input key={data.query} id={`${id}-search`} name="q" type="search" defaultValue={data.query} aria-describedby={`${id}-hint`} className="min-w-0 flex-1" /><Button type="submit"><Search aria-hidden="true" className="size-4" />{t('submitSearch')}</Button></div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p>
      {data.query && <Link href={routes.admin.payments({ tab: data.tab })} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('clearSearch')}</Link>}
    </form>
    <nav aria-label={t('tabsLabel')}>
      <ul className="flex flex-wrap gap-2">{ADMIN_MONEY_TABS.map((tab) => {
        const current = tab === data.tab;
        return <li key={tab}><Link href={routes.admin.payments({ tab, q: data.query || undefined })} aria-current={current ? 'page' : undefined} className={cn('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors', current ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>
          {t(`tabs.${tab}`)}<span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', current ? 'bg-primary-foreground text-primary' : 'bg-muted')}>{data.counts[tab]}</span>
        </Link></li>;
      })}</ul>
    </nav>
    <section aria-label={t('results')} className="space-y-3">
      <div className="space-y-1">
        {data.query && <p className="font-medium">{t('searching', { query: data.query })}</p>}
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: total })}</p>
        {total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length, count: total })}</p>}
      </div>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={data.tab === 'exceptions' && !data.query ? t('emptyExceptions') : t('emptyBody')} /> : <>
        <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="text-left text-muted-foreground"><tr>{(['what', 'person', 'amount', 'status', 'when', 'reference'] as const).map((column) => <th key={column} scope="col" className={column === 'what' ? 'w-[30%] p-3 font-medium' : column === 'amount' ? 'w-[11%] p-3 font-medium' : column === 'reference' ? 'w-[14%] p-3 font-medium' : 'w-[15%] p-3 font-medium'}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.rows.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} now={now} mobile />)}</ul>
      </>}
    </section>
  </div>;
}
