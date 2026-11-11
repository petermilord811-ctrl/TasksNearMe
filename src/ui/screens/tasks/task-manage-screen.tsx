import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, Hammer, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type CategorySlug, type ISODateTime, type TaskOwnerHandlers, type TaskOwnerView } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useTaskStatus } from '@/ui/components/status/use-status';
import { buttonVariants } from '@/ui/primitives/button';
import { TaskActions } from './task-actions';
import { TaskDetails } from './task-details';
import { TaskOffers } from './task-offers';

export interface TaskManageScreenProps {
  data: TaskOwnerView;
  handlers: TaskOwnerHandlers;
  now: ISODateTime;
  /** Preview-only starting state. */
  initialSelectedOfferIds?: string[];
  initialCancelOpen?: boolean;
  initialCancelResult?: ActionResult;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop };

export function TaskManageScreen({ data, handlers, now, initialSelectedOfferIds, initialCancelOpen, initialCancelResult }: TaskManageScreenProps) {
  const t = useTranslations('taskManage');
  const card = useTranslations('taskCard');
  const status = useTaskStatus(data.task.status);
  const { task } = data;
  const Icon = categoryIcons[task.categorySlug];
  const schedule = task.schedule.flexible ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
      ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);

  return <div className="mx-auto min-w-0 max-w-content space-y-8">
    <header className="space-y-5">
      <Link href={routes.app.tasks()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>
      <div className="flex flex-wrap items-center gap-3"><p className="flex items-center gap-2 text-sm font-medium text-secondary-foreground"><Icon aria-hidden="true" className="size-5" />{card(`categories.${task.categorySlug}`)}</p><StatusBadge {...status} /></div>
      <h1 className="break-words font-heading text-2xl/8 font-bold md:text-3xl/9.5">{task.title}</h1>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4 shadow-card sm:p-5">
        <div className="space-y-2"><p className="flex items-start gap-2 tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{schedule}</span></p><p className="text-sm text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{card('posted', { relative: formatRelative(task.postedAt, now) })}</time></p></div>
        <div className="space-y-1"><p className="text-sm text-muted-foreground">{t('budget')}</p><p className="text-xl font-semibold tabular-nums">{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : card('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) })}</p></div>
      </div>
      <TaskActions actions={data.actions} handlers={handlers} initialCancelOpen={initialCancelOpen} initialCancelResult={initialCancelResult} />
    </header>
    {data.bookingId && <section className="space-y-3 rounded-xl border bg-secondary p-4 text-secondary-foreground sm:p-5"><h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />{t('bookedTitle')}</h2><p className="text-sm">{t('bookedBody')}</p><Link href={routes.app.booking(data.bookingId)} className={buttonVariants({ variant: 'outline' })}>{t('viewBooking')}</Link></section>}
    <section aria-labelledby="task-offers-title" className="space-y-4">
      <h2 id="task-offers-title" className="font-heading text-xl font-semibold tabular-nums md:text-[22px]/7.5">{t('offers', { count: data.offers.length })}</h2>
      {data.offers.length ? <TaskOffers offers={data.offers} now={now} onAction={handlers.onOfferAction} initialSelectedOfferIds={initialSelectedOfferIds} /> : <EmptyState title={t('noOffersTitle')} body={task.location.kind === 'local' ? t('noOffersLocal', { area: task.location.areaName }) : t('noOffersRemote')} />}
    </section>
    <TaskDetails data={data} />
  </div>;
}
