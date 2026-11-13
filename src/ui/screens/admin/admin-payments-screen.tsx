import { useId } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_MONEY_TABS, routes, type AdminMoneyRow, type AdminPaymentsPageData, type BadgeTone, type ISODateTime } from '@/contracts';
import { formatMoney, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import messages from '../../../../messages/en/ui/adminPayments.json';
import { AdminFilterChip, adminCard, adminMoneyTd, adminPanel, adminSection, adminTableFrame, adminTd, adminTh, adminTr, AdminWhen } from './admin-ui';

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
    {row.booking && <Link href={routes.admin.booking(row.booking.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md text-sm font-medium text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline">{row.booking.title}</Link>}
    {row.exception && <div className="space-y-1"><StatusBadge tone="warning" label={t(`exceptions.${row.exception}`)} /><p className="text-sm text-muted-foreground">{t(`exceptionHelp.${row.exception}`)}</p></div>}
  </div>;
  const person = <Link href={routes.admin.user(row.person.id)} className="inline-flex min-h-11 items-center rounded-md font-medium underline-offset-4 hover:text-primary hover:underline">{row.person.displayName}</Link>;
  const when = <AdminWhen at={row.at} title={formatRelative(row.at, now)} />;
  const reference = row.reference ? <code className="font-mono text-xs break-all text-muted-foreground">{row.reference}</code> : null;
  if (mobile) return <li className={cn(adminCard, 'space-y-3')}>
    <div className="flex flex-wrap items-start justify-between gap-2">{what}<p className="text-lg font-semibold tabular-nums">{formatMoney(row.amountCents)}</p></div>
    <StatusBadge tone={toneOf(row.status)} label={status} />
    <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]">
      <div><dt className="text-muted-foreground">{t('columns.person')}</dt><dd>{person}</dd></div>
      <div><dt className="text-muted-foreground">{t('columns.when')}</dt><dd className="tabular-nums">{when}</dd></div>
      {reference && <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.reference')}</dt><dd>{reference}</dd></div>}
    </dl>
  </li>;
  return <tr className={adminTr}>
    <th scope="row" className={cn(adminTd, 'text-left font-normal')}>{what}</th>
    <td className={adminTd}>{person}</td>
    <td className={adminMoneyTd}>{formatMoney(row.amountCents)}</td>
    <td className={adminTd}><StatusBadge tone={toneOf(row.status)} label={status} /></td>
    <td className={cn(adminTd, 'tabular-nums text-muted-foreground')}>{when}</td>
    <td className={adminTd}>{reference}</td>
  </tr>;
}

/** Staff: charges, refunds, transfers and payouts, and what doesn't add up (UI-034). */
export function AdminPaymentsScreen({ data, now }: AdminPaymentsScreenProps) {
  const t = useTranslations('adminPayments');
  const id = useId();
  const total = data.counts[data.tab];
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')} />
    <section aria-labelledby={`${id}-totals`} className="space-y-3">
      <h2 id={`${id}-totals`} className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('totalsTitle')}</h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([['charged', data.totals.chargedCents], ['refunded', data.totals.refundedCents], ['transferred', data.totals.transferredCents], ['paidOut', data.totals.paidOutCents]] as const).map(([key, cents]) => <div key={key} className={cn(adminPanel, 'space-y-1 p-4')}><dt className="text-sm text-muted-foreground">{t(`totals.${key}`)}</dt><dd className="font-display text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(cents)}</dd></div>)}</dl>
    </section>
    <form method="get" action={routes.admin.payments()} role="search" aria-label={t('search')} className={cn(adminSection, 'space-y-2')}>
      <input type="hidden" name="tab" value={data.tab} />
      <Label htmlFor={`${id}-search`}>{t('search')}</Label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input key={data.query} id={`${id}-search`} name="q" type="search" defaultValue={data.query} aria-describedby={`${id}-hint`} className="min-w-0 flex-1" /><Button type="submit"><Search aria-hidden="true" className="size-4" />{t('submitSearch')}</Button></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p>
        {data.query && <Link href={routes.admin.payments({ tab: data.tab })} className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline"><X aria-hidden="true" className="size-4" />{t('clearSearch')}</Link>}
      </div>
    </form>
    <nav aria-label={t('tabsLabel')}>
      <ul className="flex flex-wrap gap-2">{ADMIN_MONEY_TABS.map((tab) => <li key={tab}>
        <AdminFilterChip href={routes.admin.payments({ tab, q: data.query || undefined })} current={tab === data.tab} count={data.counts[tab]}>{t(`tabs.${tab}`)}</AdminFilterChip>
      </li>)}</ul>
    </nav>
    <section aria-label={t('results')} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {data.query && <p className="font-medium">{t('searching', { query: data.query })}</p>}
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: total })}</p>
        {total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length, count: total })}</p>}
      </div>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={data.tab === 'exceptions' && !data.query ? t('emptyExceptions') : t('emptyBody')} /> : <>
        <div className={adminTableFrame}><table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead><tr>{(['what', 'person', 'amount', 'status', 'when', 'reference'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, column === 'what' ? 'w-[30%]' : column === 'amount' ? 'w-[11%] text-right' : column === 'reference' ? 'w-[14%]' : 'w-[15%]')}>{t(`columns.${column}`)}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} now={now} />)}</tbody>
        </table></div>
        <ul className="space-y-3 lg:hidden">{data.rows.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} now={now} mobile />)}</ul>
      </>}
    </section>
  </div>;
}
