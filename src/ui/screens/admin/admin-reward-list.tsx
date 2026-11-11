import type { ReactNode } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AdminRewardRow, type AdminRewardsHandlers, type ISODateTime } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useRewardStatus } from '@/ui/components/status/use-status';
import { Deadline } from '@/ui/components/time/deadline';
import { AdminRewardActionButtons, AdminRewardControls, type AdminRewardsPreviewState } from './admin-reward-controls';

const linkClass = 'inline-flex min-h-11 max-w-full items-center rounded-md py-2 font-medium text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline';

function RewardSummary({ row, now }: { row: AdminRewardRow; now: ISODateTime }) {
  const t = useTranslations('adminRewards');
  return <div className="space-y-2">
    <p className="font-semibold">{t(`programs.${row.program}`)}</p>
    <p className="text-lg font-semibold tabular-nums">{formatMoney(row.amountCents)}</p>
    <StatusBadge {...useRewardStatus(row.status, row.holdUntil)} />
    <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={row.createdAt} title={formatRelative(row.createdAt, now)}>{t('created', { at: formatDateTime(row.createdAt) })}</time></p>
  </div>;
}

function RewardPeople({ row }: { row: AdminRewardRow }) {
  const t = useTranslations('adminRewards');
  return <div className="min-w-0 space-y-2">
    <div><p className="text-sm text-muted-foreground">{t('helper')}</p><Link href={routes.admin.user(row.helper.id)} className={linkClass}>{row.helper.displayName}</Link></div>
    {row.booking ? <div className="space-y-1 border-t pt-2">
      <Link href={routes.admin.booking(row.booking.id)} className={linkClass}>{row.booking.title}</Link>
      <div><p className="text-sm text-muted-foreground">{t('client')}</p><Link href={routes.admin.user(row.booking.client.id)} className={linkClass}>{row.booking.client.displayName}</Link></div>
      <p className="text-sm tabular-nums">{t('price', { amount: formatMoney(row.booking.priceCents) })}</p>
      {row.booking.completedAt && <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={row.booking.completedAt}>{t('completed', { at: formatDateTime(row.booking.completedAt) })}</time></p>}
    </div> : <p className="text-sm text-muted-foreground">{t('noBooking')}</p>}
  </div>;
}

function RewardSignals({ row, now }: { row: AdminRewardRow; now: ISODateTime }) {
  const t = useTranslations('adminRewards');
  return <div className="space-y-3">
    {row.holdUntil && <Deadline label={t('hold')} at={row.holdUntil} now={now} />}
    {row.signals.length > 0 ? <ul aria-label={t('signalsLabel')} className="flex flex-wrap gap-2">{row.signals.map((signal) => <li key={signal}><StatusBadge tone="warning" label={t(`signals.${signal}`)} icon={<TriangleAlert />} /></li>)}</ul> : <p className="text-sm text-muted-foreground">{t('noSignals')}</p>}
  </div>;
}

export interface AdminRewardListProps { rows: AdminRewardRow[]; now: ISODateTime; handlers?: AdminRewardsHandlers; empty?: ReactNode }

/** Leaving handlers out makes the person's reward history read-only, regardless of row actions. */
export function AdminRewardList({ rows, now, handlers, empty, ...previewState }: AdminRewardListProps & AdminRewardsPreviewState) {
  const t = useTranslations('adminRewards');
  const content = rows.length === 0 ? empty : <>
    <div className="hidden rounded-xl border bg-card shadow-card lg:block">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">{t('tableCaption')}</caption>
        <thead className="text-left text-muted-foreground"><tr>
          <th scope="col" className="w-[23%] p-3 font-medium">{t('columns.reward')}</th>
          <th scope="col" className="w-[30%] p-3 font-medium">{t('columns.people')}</th>
          <th scope="col" className="p-3 font-medium">{t('columns.signals')}</th>
          {handlers && <th scope="col" className="w-[17%] p-3 font-medium">{t('columns.actions')}</th>}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top hover:bg-accent/50">
          <th scope="row" className="p-3 text-left font-normal"><RewardSummary row={row} now={now} /></th>
          <td className="p-3"><RewardPeople row={row} /></td>
          <td className="p-3"><RewardSignals row={row} now={now} /></td>
          {handlers && <td className="p-3"><AdminRewardActionButtons row={row} /></td>}
        </tr>)}</tbody>
      </table>
    </div>
    <ul aria-label={t('results')} className="space-y-3 lg:hidden">{rows.map((row) => <li key={row.id} className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-card">
      <RewardSummary row={row} now={now} />
      <div className="border-t pt-3"><RewardPeople row={row} /></div>
      <div className="border-t pt-3"><RewardSignals row={row} now={now} /></div>
      {handlers && <div className="border-t pt-3"><AdminRewardActionButtons row={row} /></div>}
    </li>)}</ul>
  </>;
  return handlers ? <AdminRewardControls rows={rows} handlers={handlers} {...previewState}>{content}</AdminRewardControls> : content;
}
