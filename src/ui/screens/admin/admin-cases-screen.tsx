import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_CASE_STATUS_FILTERS, ADMIN_QUEUES, routes, type AdminCaseRow, type AdminCasesPageData, type ISODateTime } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useCaseStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { AdminResponseTarget } from './admin-response-target';
import { AdminFilterChip, adminCardLink, adminSection, adminTableFrame, adminTd, adminTh, adminTr } from './admin-ui';

export interface AdminCasesScreenProps { data: AdminCasesPageData; now: ISODateTime }

function CaseSummary({ item, linked = false }: { item: AdminCaseRow; linked?: boolean }) {
  const t = useTranslations('adminCases');
  return <div className="min-w-0 space-y-1">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn('inline-flex items-center gap-1.5 font-medium', item.priority === 'urgent' ? 'text-destructive' : item.priority === 'high' ? 'text-warning' : 'text-muted-foreground')}>
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', item.priority === 'urgent' ? 'bg-destructive' : item.priority === 'high' ? 'bg-warning' : 'bg-muted-foreground/50')} />
        {t('priority', { priority: t(`priorities.${item.priority}`) })}
      </span>{' '}
      <span className="text-muted-foreground">{t(`types.${item.type}`)}</span>
    </div>
    {linked
      ? <Link href={routes.admin.case(item.id)} className="inline-flex min-h-11 max-w-full items-center rounded-md py-2 font-semibold text-foreground underline-offset-4 [overflow-wrap:anywhere] hover:text-primary hover:underline">{item.subject}</Link>
      : <h2 className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] break-words">{item.subject}</h2>}
    {item.awaitingReply && <p className="flex items-center gap-1.5 text-sm font-medium text-primary"><span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />{t('newReply')}</p>}
  </div>;
}

function DesktopCaseRow({ item, now }: { item: AdminCaseRow; now: ISODateTime }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  return <tr className={adminTr}>
    <th scope="row" className={cn(adminTd, 'text-left font-normal')}><CaseSummary item={item} linked /></th>
    <td className={cn(adminTd, 'break-words')}>{item.openedBy.displayName}</td>
    <td className={adminTd}><StatusBadge {...status} /></td>
    <td className={adminTd}><AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} /></td>
    <td className={cn(adminTd, 'break-words', !item.assignee && 'text-muted-foreground')}>{item.assignee?.displayName ?? t('unassigned')}</td>
  </tr>;
}

function MobileCaseRow({ item, now }: { item: AdminCaseRow; now: ISODateTime }) {
  const t = useTranslations('adminCases');
  const status = useCaseStatus(item.status);
  return <li>
    <Link href={routes.admin.case(item.id)} className={cn(adminCardLink, 'group space-y-3')}>
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><CaseSummary item={item} /></div><ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" /></div>
      <StatusBadge {...status} />
      <dl className="grid grid-cols-2 gap-3 border-t border-foreground/[0.07] pt-3 text-sm dark:border-white/[0.07]">
        <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">{t('columns.openedBy')}</dt><dd className="break-words">{item.openedBy.displayName}</dd></div>
        <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">{t('columns.assignee')}</dt><dd className="break-words">{item.assignee?.displayName ?? t('unassigned')}</dd></div>
        <div className="col-span-2 space-y-1"><dt className="text-muted-foreground">{t('columns.response')}</dt><dd><AdminResponseTarget slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} now={now} /></dd></div>
      </dl>
    </Link>
  </li>;
}

/** Support's queues: filter by queue, status and "mine"; a table on wide screens, cards on phones. */
export function AdminCasesScreen({ data, now }: AdminCasesScreenProps) {
  const t = useTranslations('adminCases');
  const { filters } = data;
  return <div className="min-w-0 space-y-6">
    <PageHeader title={t('title')} description={t('intro')} />
    <div className={cn(adminSection, 'space-y-4')}>
      <nav aria-label={t('queueFilter')} className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('queueFilter')}</p>
        <div className="flex flex-wrap gap-2">
          <AdminFilterChip href={routes.admin.cases({ ...filters, queue: undefined })} current={!filters.queue} currentValue="true">{t('allQueues')}</AdminFilterChip>
          {ADMIN_QUEUES.map((queue) => <AdminFilterChip key={queue} href={routes.admin.cases({ ...filters, queue })} current={filters.queue === queue} currentValue="true">{t(`queues.${queue}`)}</AdminFilterChip>)}
        </div>
      </nav>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 border-t border-foreground/[0.07] pt-4 dark:border-white/[0.07]">
        <nav aria-label={t('statusFilter')} className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">{t('statusFilter')}</p>
          <div className="flex flex-wrap gap-2">{ADMIN_CASE_STATUS_FILTERS.map((status) => <AdminFilterChip key={status} href={routes.admin.cases({ ...filters, status })} current={filters.status === status} currentValue="true">{t(`filters.${status}`)}</AdminFilterChip>)}</div>
        </nav>
        <nav aria-label={t('assignmentFilter')}>
          <AdminFilterChip href={routes.admin.cases({ ...filters, mine: !filters.mine })} current={filters.mine} currentValue="true">{t('assignedToMe')}{' '}<span className={cn('font-normal', filters.mine ? 'text-background/80' : 'text-muted-foreground')}>{t(filters.mine ? 'filterOn' : 'filterOff')}</span></AdminFilterChip>
        </nav>
      </div>
    </div>
    <section aria-label={t('results')} className="space-y-3">
      <p className="text-sm font-medium tabular-nums text-muted-foreground">{t('count', { count: data.totalCount })}</p>
      {data.cases.length === 0
        ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('clearFilters'), href: routes.admin.cases({ status: 'all' }) }} />
        : <>
          <div className={adminTableFrame}>
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{t('tableCaption')}</caption>
              <thead><tr>
                <th scope="col" className={cn(adminTh, 'w-[30%]')}>{t('columns.case')}</th>
                <th scope="col" className={cn(adminTh, 'w-[14%]')}>{t('columns.openedBy')}</th>
                <th scope="col" className={cn(adminTh, 'w-[19%]')}>{t('columns.status')}</th>
                <th scope="col" className={cn(adminTh, 'w-[23%]')}>{t('columns.response')}</th>
                <th scope="col" className={cn(adminTh, 'w-[14%]')}>{t('columns.assignee')}</th>
              </tr></thead>
              <tbody>{data.cases.map((item) => <DesktopCaseRow key={item.id} item={item} now={now} />)}</tbody>
            </table>
          </div>
          <ul className="space-y-3 lg:hidden">{data.cases.map((item) => <MobileCaseRow key={item.id} item={item} now={now} />)}</ul>
        </>}
    </section>
  </div>;
}
