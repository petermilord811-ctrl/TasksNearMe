import Link from 'next/link';
import { ArrowUpRight, CheckCheck, CircleAlert, CircleCheck, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_QUEUES, routes, type AdminHomeData, type ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { adminCardLink } from './admin-ui';

export interface AdminHomeScreenProps { data: AdminHomeData; now: ISODateTime }

/** Staff home: each queue's open cases, what's past its response target, and the oldest; then verifications. */
export function AdminHomeScreen({ data, now }: AdminHomeScreenProps) {
  const { formatDateTime, formatRelative } = useFormat();
  const t = useTranslations('adminHome');
  const labels = useTranslations('adminCases');
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <PageHeader title={t('title')} description={t('intro')}>
      <Link href={routes.admin.cases({ mine: true, status: 'active' })} className={buttonVariants({ variant: 'outline' })}>{t('myCases', { count: data.myOpenCount })}</Link>
    </PageHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      {ADMIN_QUEUES.map((queue) => {
        const summary = data.queues.find((item) => item.queue === queue);
        const late = Boolean(summary && summary.slaBreaches > 0);
        return <Link key={queue} href={routes.admin.cases({ queue, status: 'active' })} className={cn(adminCardLink, 'group space-y-4 sm:p-5', late && 'border-destructive/25 dark:border-destructive/35')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.02em]">{labels(`queues.${queue}`)}</h2>
            <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
          </div>
          <p className="font-display text-[2rem] leading-none font-semibold tracking-[-0.03em] tabular-nums">{t('openCount', { count: summary?.openCount ?? 0 })}</p>
          {late
            ? <p className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive tabular-nums dark:bg-destructive/15"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />{t('pastDue', { count: summary!.slaBreaches })}</p>
            : <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />{t('onTime')}</p>}
          <div className="border-t border-foreground/[0.07] pt-3 text-sm tabular-nums text-muted-foreground dark:border-white/[0.07]">
            {summary?.oldestOpenedAt ? <>
              <time dateTime={summary.oldestOpenedAt} className="block">{formatDateTime(summary.oldestOpenedAt)}</time>
              <p>{t('oldest', { relative: formatRelative(summary.oldestOpenedAt, now) })}</p>
            </> : <p>{t('noCases')}</p>}
          </div>
        </Link>;
      })}
    </div>
    <Link href={routes.admin.verifications()} className={cn(adminCardLink, 'group flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:p-5')}>
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-2 font-display text-xl leading-7 font-semibold tracking-[-0.02em]"><ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('verifications.title')}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{t('verifications.counts', { address: data.verifications.counts.address, identity: data.verifications.counts.identity, background: data.verifications.counts.background })}</p>
        {data.verifications.oldestAt && <p className="text-sm text-muted-foreground tabular-nums">{t('oldest', { relative: formatRelative(data.verifications.oldestAt, now) })}</p>}
      </div>
      <ArrowUpRight aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground sm:block" />
    </Link>
    {data.queues.every((queue) => queue.openCount === 0) && <EmptyState title={t('quietTitle')} body={t('quietBody')} icon={<CheckCheck className="size-6" />} action={{ label: t('viewCases'), href: routes.admin.cases({ status: 'all' }) }} />}
  </div>;
}
