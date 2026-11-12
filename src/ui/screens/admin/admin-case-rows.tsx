import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type AdminCaseRow, type ISODateTime } from '@/contracts';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { AdminResponseTarget } from './admin-response-target';

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

/** Cases as a table on wide screens and cards on phones (a person's page, a task's page). */
export function AdminCaseRows({ items, now, caption }: { items: AdminCaseRow[]; now: ISODateTime; caption: string }) {
  const cases = useTranslations('adminCases');
  return <>
    <div className="hidden rounded-xl border bg-card shadow-card lg:block"><table className="w-full table-fixed text-sm"><caption className="sr-only">{caption}</caption><thead className="text-left text-muted-foreground"><tr>{(['case', 'openedBy', 'status', 'response', 'assignee'] as const).map((column) => <th key={column} scope="col" className={column === 'case' ? 'w-[30%] p-3 font-medium' : column === 'response' ? 'w-[23%] p-3 font-medium' : column === 'status' ? 'w-[19%] p-3 font-medium' : 'w-[14%] p-3 font-medium'}>{cases(`columns.${column}`)}</th>)}</tr></thead><tbody>{items.map((item) => <CaseRow key={item.id} item={item} now={now} />)}</tbody></table></div>
    <ul className="space-y-3 lg:hidden">{items.map((item) => <CaseRow key={item.id} item={item} now={now} mobile />)}</ul>
  </>;
}
