import Link from 'next/link';
import { ArrowUpRight, ShieldCheck, CheckCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ADMIN_QUEUES, routes, type AdminHomeData, type ISODateTime } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { buttonVariants } from '@/ui/primitives/button';

export interface AdminHomeScreenProps { data: AdminHomeData; now: ISODateTime }

export function AdminHomeScreen({ data, now }: AdminHomeScreenProps) {
  const t = useTranslations('adminHome');
  const labels = useTranslations('adminCases');
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>
      <Link href={routes.admin.cases({ mine: true, status: 'active' })} className={buttonVariants({ variant: 'outline' })}>{t('myCases', { count: data.myOpenCount })}</Link>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      {ADMIN_QUEUES.map((queue) => {
        const summary = data.queues.find((item) => item.queue === queue);
        return <Link key={queue} href={routes.admin.cases({ queue, status: 'active' })} className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-card transition-colors hover:bg-accent sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl/7 font-semibold">{labels(`queues.${queue}`)}</h2>
            <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </div>
          <p className="font-heading text-2xl/8 font-bold tabular-nums">{t('openCount', { count: summary?.openCount ?? 0 })}</p>
          {summary && summary.slaBreaches > 0
            ? <p className="font-medium tabular-nums text-destructive">{t('pastDue', { count: summary.slaBreaches })}</p>
            : <p className="text-sm text-muted-foreground">{t('onTime')}</p>}
          <div className="border-t pt-3 text-sm tabular-nums text-muted-foreground">
            {summary?.oldestOpenedAt ? <>
              <time dateTime={summary.oldestOpenedAt} className="block">{formatDateTime(summary.oldestOpenedAt)}</time>
              <p>{t('oldest', { relative: formatRelative(summary.oldestOpenedAt, now) })}</p>
            </> : <p>{t('noCases')}</p>}
          </div>
        </Link>;
      })}
    </div>
    <Link href={routes.admin.verifications()} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-2 font-heading text-xl/7 font-semibold"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" />{t('verifications.title')}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{t('verifications.counts', { address: data.verifications.counts.address, identity: data.verifications.counts.identity, background: data.verifications.counts.background })}</p>
        {data.verifications.oldestAt && <p className="text-sm text-muted-foreground tabular-nums">{t('oldest', { relative: formatRelative(data.verifications.oldestAt, now) })}</p>}
      </div>
      <ArrowUpRight aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground sm:block" />
    </Link>
    {data.queues.every((queue) => queue.openCount === 0) && <EmptyState title={t('quietTitle')} body={t('quietBody')} icon={<CheckCheck className="size-6" />} action={{ label: t('viewCases'), href: routes.admin.cases({ status: 'all' }) }} />}
  </div>;
}
