import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, Hammer, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type CategorySlug, type InviteHandlers, type ISODateTime, type TaskOwnerHandlers, type TaskOwnerView } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { InviteCard } from '@/ui/components/invites/invite-card';
import { PushPrompt } from '@/ui/components/push/push-device';
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
  /** Supplied by routes that include direct invites. */
  inviteHandlers?: InviteHandlers;
  /** Preview-only starting state. */
  initialSelectedOfferIds?: string[];
  initialCancelOpen?: boolean;
  initialCancelResult?: ActionResult;
}

const categoryIcons: Record<CategorySlug, LucideIcon> = { 'furniture-assembly': Hammer, 'moving-help': Package, 'yard-cleanup': Leaf, 'light-cleaning': Sparkles, 'computer-help': Laptop };

export function TaskManageScreen({ data, handlers, inviteHandlers, now, initialSelectedOfferIds, initialCancelOpen, initialCancelResult }: TaskManageScreenProps) {
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
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
        <div className="space-y-2"><p className="flex items-start gap-2 tabular-nums"><CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{schedule}</span></p><p className="text-sm text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{card('posted', { relative: formatRelative(task.postedAt, now) })}</time></p></div>
        <div className="space-y-1 sm:text-right"><p className="text-sm text-muted-foreground">{t('budget')}</p><p className="font-display text-2xl/8 font-semibold tracking-[-0.015em] tabular-nums">{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : card('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) })}</p></div>
      </div>
      <TaskActions actions={data.actions} handlers={handlers} initialCancelOpen={initialCancelOpen} initialCancelResult={initialCancelResult} />
    </header>
    {task.status === 'open' && <PushPrompt push={data.push} onSave={handlers.onSavePushSubscription} kind="offers" />}
    {data.bookingId && <section className="space-y-3 rounded-[1.375rem] border border-success/25 bg-success/[0.07] p-4 sm:p-5"><h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />{t('bookedTitle')}</h2><p className="text-sm">{t('bookedBody')}</p><Link href={routes.app.booking(data.bookingId)} className={buttonVariants({ variant: 'outline' })}>{t('viewBooking')}</Link></section>}
    {data.invites && data.invites.length > 0 && inviteHandlers && <section aria-labelledby="task-invites-title" className="space-y-4">
      <h2 id="task-invites-title" className="font-heading text-xl font-semibold md:text-[22px]/7.5">{t('invites')}</h2>
      <ul className="grid gap-4 lg:grid-cols-2">{data.invites.map((invite) => <li key={invite.id} className="min-w-0"><InviteCard invite={invite} handlers={inviteHandlers} now={now} headingLevel={3} /></li>)}</ul>
    </section>}
    <section aria-labelledby="task-offers-title" className="space-y-4">
      <h2 id="task-offers-title" className="font-heading text-xl font-semibold tabular-nums md:text-[22px]/7.5">{t('offers', { count: data.offers.length })}</h2>
      {data.offers.length ? <TaskOffers offers={data.offers} now={now} onAction={handlers.onOfferAction} initialSelectedOfferIds={initialSelectedOfferIds} /> : <EmptyState title={t('noOffersTitle')} body={task.location.kind === 'local' ? t('noOffersLocal', { area: task.location.areaName }) : t('noOffersRemote')} />}
    </section>
    <TaskDetails data={data} />
  </div>;
}
