import Link from 'next/link';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Hammer, Hourglass, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type CategorySlug, type InviteHandlers, type ISODateTime, type OfferStatus, type TaskOwnerHandlers, type TaskOwnerView } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { InviteCard } from '@/ui/components/invites/invite-card';
import { OfferCard } from '@/ui/components/offers/offer-card';
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

/** Offers the client can still act on, or the one they booked; expired, declined and withdrawn ones are earlier. */
const CURRENT_OFFER_STATUSES: ReadonlySet<OfferStatus> = new Set(['pending', 'stale', 'accepted']);

export function TaskManageScreen({ data, handlers, inviteHandlers, now, initialSelectedOfferIds, initialCancelOpen, initialCancelResult }: TaskManageScreenProps) {
  const { formatDate, formatDateTime, formatRelative, formatTimeRange, dayKey } = useFormat();
  const t = useTranslations('taskManage');
  const card = useTranslations('taskCard');
  const status = useTaskStatus(data.task.status);
  const { task } = data;
  const Icon = categoryIcons[task.categorySlug];
  // Offers still in play (or booked) come first; the rest are history (audit M31).
  const current = data.offers.filter((offer) => CURRENT_OFFER_STATUSES.has(offer.status));
  const earlier = data.offers.filter((offer) => !CURRENT_OFFER_STATUSES.has(offer.status));
  const schedule = task.schedule.flexible ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
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
      <h2 id="task-offers-title" className="font-heading text-xl font-semibold tabular-nums md:text-[22px]/7.5">{t('offers', { count: current.length })}</h2>
      {current.length > 0
        ? <TaskOffers offers={current} now={now} onAction={handlers.onOfferAction} initialSelectedOfferIds={initialSelectedOfferIds} />
        : earlier.length > 0
          ? <div className="flex gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"><Hourglass className="size-4" /></span>
              <div className="min-w-0 space-y-1"><h3 className="font-heading text-[1.0625rem]/6 font-semibold">{t('noCurrentTitle')}</h3><p className="text-sm text-muted-foreground">{t('noCurrentBody')}</p></div>
            </div>
          : <EmptyState title={t('noOffersTitle')} body={task.location.kind === 'local' ? t('noOffersLocal', { area: task.location.areaName }) : t('noOffersRemote')} />}
      {/* Expired, declined and withdrawn offers stay one tap away, out of the comparison (audit M31). */}
      {earlier.length > 0 && <details className="group/earlier">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-200 group-open/earlier:rotate-90 motion-reduce:transition-none" />
          <span className="tabular-nums">{t('earlier', { count: earlier.length })}</span>
        </summary>
        <ul className="mt-3 grid min-w-0 gap-4 lg:grid-cols-2">{earlier.map((offer) => <li key={offer.id} className="min-w-0"><OfferCard offer={offer} now={now} onAction={handlers.onOfferAction} /></li>)}</ul>
      </details>}
    </section>
    <TaskDetails data={data} />
  </div>;
}
