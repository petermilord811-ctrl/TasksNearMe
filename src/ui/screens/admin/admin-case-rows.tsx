import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type AdminCaseRow, type ISODateTime } from '@/contracts';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { AdminResponseTarget } from './admin-response-target';
import { adminCard, adminTableFrame, adminTd, adminTh, adminTr } from './admin-ui';

function CaseRow({ item, now, mobile = false }: { item: AdminCaseRow; now: ISODateTime; mobile?: boolean }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  const summary = <div className="space-y-1">
    <p className="text-sm text-muted-foreground">{t(`types.${item.type}`)}{' · '}{t('priority', { priority: t(`priorities.${item.priority}`) })}</p>
    <Link href={routes.admin.case(item.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md py-2 font-semibold text-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline">{item.subject}</Link>
    {item.awaitingReply && <p className="flex items-center gap-1.5 text-sm font-medium text-primary"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />{t('newReply')}</p>}
  </div>;
  const target = <AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} />;
  const assignee = item.assignee?.displayName ?? t('unassigned');
  if (mobile) return <li className={cn(adminCard, 'space-y-3')}>
    {summary}
    <StatusBadge {...status} />
    <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]">
      <div className="min-w-0"><dt className="text-muted-foreground">{t('columns.openedBy')}</dt><dd className="break-words">{item.openedBy.displayName}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">{t('columns.assignee')}</dt><dd className="break-words">{assignee}</dd></div>
      <div className="col-span-2"><dt className="text-muted-foreground">{t('columns.response')}</dt><dd>{target}</dd></div>
    </dl>
  </li>;
  return <tr className={adminTr}>
    <th scope="row" className={cn(adminTd, 'text-left font-normal')}>{summary}</th>
    <td className={cn(adminTd, 'break-words')}>{item.openedBy.displayName}</td>
    <td className={adminTd}><StatusBadge {...status} /></td>
    <td className={adminTd}>{target}</td>
    <td className={cn(adminTd, 'break-words', !item.assignee && 'text-muted-foreground')}>{assignee}</td>
  </tr>;
}

const WIDTHS = { case: 'w-[30%]', openedBy: 'w-[14%]', status: 'w-[19%]', response: 'w-[23%]', assignee: 'w-[14%]' } as const;

/** Cases as a table on wide screens and cards on phones (a person's page, a task's page). */
export function AdminCaseRows({ items, now, caption }: { items: AdminCaseRow[]; now: ISODateTime; caption: string }) {
  const cases = useTranslations('adminCases');
  return <>
    <div className={adminTableFrame}><table className="w-full table-fixed text-sm"><caption className="sr-only">{caption}</caption>
      <thead><tr>{(['case', 'openedBy', 'status', 'response', 'assignee'] as const).map((column) => <th key={column} scope="col" className={cn(adminTh, WIDTHS[column])}>{cases(`columns.${column}`)}</th>)}</tr></thead>
      <tbody>{items.map((item) => <CaseRow key={item.id} item={item} now={now} />)}</tbody>
    </table></div>
    <ul className="space-y-3 lg:hidden">{items.map((item) => <CaseRow key={item.id} item={item} now={now} mobile />)}</ul>
  </>;
}
