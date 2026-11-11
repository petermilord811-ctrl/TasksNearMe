import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_CASE_STATUS_FILTERS, ADMIN_QUEUES, routes, type AdminCaseRow, type AdminCasesPageData, type ISODateTime } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { AdminResponseTarget } from './admin-response-target';

export interface AdminCasesScreenProps { data: AdminCasesPageData; now: ISODateTime }

function FilterLink({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={selected ? 'true' : undefined} className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent', selected ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card text-muted-foreground')}>
    {selected && <Check aria-hidden="true" className="size-4 shrink-0" />}{children}
  </Link>;
}

function CaseSummary({ item, linked = false }: { item: AdminCaseRow; linked?: boolean }) {
  const t = useTranslations('adminCases');
  return <div className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn('font-medium', item.priority === 'urgent' ? 'text-destructive' : item.priority === 'high' ? 'text-warning' : 'text-muted-foreground')}>{t('priority', { priority: t(`priorities.${item.priority}`) })}</span>{' '}
      <span className="text-muted-foreground">{t(`types.${item.type}`)}</span>
    </div>
    {linked
      ? <Link href={routes.admin.case(item.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md py-2 font-semibold text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline">{item.subject}</Link>
      : <h2 className="break-words font-heading text-[17px]/6 font-semibold">{item.subject}</h2>}
    {item.awaitingReply && <p className="flex items-center gap-1.5 text-sm font-medium text-primary"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />{t('newReply')}</p>}
  </div>;
}

function DesktopCaseRow({ item, now }: { item: AdminCaseRow; now: ISODateTime }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  return <tr className="border-t align-top hover:bg-accent/50">
    <th scope="row" className="p-3 text-left font-normal"><CaseSummary item={item} linked /></th>
    <td className="break-words p-3">{item.openedBy.displayName}</td>
    <td className="p-3"><StatusBadge {...status} /></td>
    <td className="p-3"><AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} /></td>
    <td className="break-words p-3">{item.assignee?.displayName ?? t('unassigned')}</td>
  </tr>;
}

function MobileCaseRow({ item, now }: { item: AdminCaseRow; now: ISODateTime }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  return <li>
    <Link href={routes.admin.case(item.id)} className="block min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:bg-accent">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><CaseSummary item={item} /></div><ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" /></div>
      <StatusBadge {...status} />
      <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
        <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">{t('columns.openedBy')}</dt><dd className="break-words">{item.openedBy.displayName}</dd></div>
        <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">{t('columns.assignee')}</dt><dd className="break-words">{item.assignee?.displayName ?? t('unassigned')}</dd></div>
        <div className="col-span-2 space-y-1"><dt className="text-muted-foreground">{t('columns.response')}</dt><dd><AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} /></dd></div>
      </dl>
    </Link>
  </li>;
}

export function AdminCasesScreen({ data, now }: AdminCasesScreenProps) {
  const t = useTranslations('adminCases');
  const { filters } = data;
  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>
    </header>
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <nav aria-label={t('queueFilter')} className="space-y-2">
        <p className="text-sm font-semibold">{t('queueFilter')}</p>
        <div className="flex flex-wrap gap-2">
          <FilterLink href={routes.admin.cases({ ...filters, queue: undefined })} selected={!filters.queue}>{t('allQueues')}</FilterLink>
          {ADMIN_QUEUES.map((queue) => <FilterLink key={queue} href={routes.admin.cases({ ...filters, queue })} selected={filters.queue === queue}>{t(`queues.${queue}`)}</FilterLink>)}
        </div>
      </nav>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <nav aria-label={t('statusFilter')} className="space-y-2">
          <p className="text-sm font-semibold">{t('statusFilter')}</p>
          <div className="flex flex-wrap gap-2">{ADMIN_CASE_STATUS_FILTERS.map((status) => <FilterLink key={status} href={routes.admin.cases({ ...filters, status })} selected={filters.status === status}>{t(`filters.${status}`)}</FilterLink>)}</div>
        </nav>
        <nav aria-label={t('assignmentFilter')}><FilterLink href={routes.admin.cases({ ...filters, mine: !filters.mine })} selected={filters.mine}>{t('assignedToMe')}{' '}<span className="font-normal">{t(filters.mine ? 'filterOn' : 'filterOff')}</span></FilterLink></nav>
      </div>
    </div>
    <section aria-label={t('results')} className="space-y-3">
      <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: data.totalCount })}</p>
      {data.cases.length === 0
        ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('clearFilters'), href: routes.admin.cases({ status: 'all' }) }} />
        : <>
          <div className="hidden rounded-xl border bg-card shadow-card lg:block">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{t('tableCaption')}</caption>
              <thead className="text-left text-muted-foreground"><tr>
                <th scope="col" className="w-[30%] p-3 font-medium">{t('columns.case')}</th>
                <th scope="col" className="w-[14%] p-3 font-medium">{t('columns.openedBy')}</th>
                <th scope="col" className="w-[19%] p-3 font-medium">{t('columns.status')}</th>
                <th scope="col" className="w-[23%] p-3 font-medium">{t('columns.response')}</th>
                <th scope="col" className="w-[14%] p-3 font-medium">{t('columns.assignee')}</th>
              </tr></thead>
              <tbody>{data.cases.map((item) => <DesktopCaseRow key={item.id} item={item} now={now} />)}</tbody>
            </table>
          </div>
          <ul className="space-y-3 lg:hidden">{data.cases.map((item) => <MobileCaseRow key={item.id} item={item} now={now} />)}</ul>
        </>}
    </section>
  </div>;
}
