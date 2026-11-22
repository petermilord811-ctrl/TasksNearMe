import { CalendarDays, ClipboardList, Hammer, Info, Laptop, Leaf, MapPin, MessageCircleQuestion, MessagesSquare, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CategorySlug, ISODateTime, PortalTaskView, TaskPublicView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { Highlight } from '@/ui/components/community/highlight';
import { SaveButton } from '@/ui/components/community/save-button';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { LiveOfferCount, NewSinceBadge } from '@/ui/components/tasks/task-live';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

const NEW_FOR_MS = 24 * 3_600_000;

/** The task's price as people read it: the fixed price, or the rate per hour with the hours it's capped at. */
export function useTaskPrice(task: TaskPublicView): { price: string; note: string | null } {
  const card = useTranslations('taskCard');
  return task.budget.type === 'fixed'
    ? { price: formatMoney(task.budget.priceCents), note: null }
    : { price: `${formatMoney(task.budget.rateCents)}${card('perHour')}`, note: card('upToHours', { hours: formatHours(task.budget.hoursCap) }) };
}

const factClass = 'inline-flex min-h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-foreground/80';

/** Offers that ended without a booking: the helper may send a new one (as find work says, audit M21 and M23). */
const CLOSED_OFFERS = ['expired', 'declined', 'withdrawn'] as const;
type ClosedOffer = (typeof CLOSED_OFFERS)[number];

/** A helper's standing on a task, as find work says it (audit M23): their next step, and a line saying why. */
export function useHelperStanding(view: PortalTaskView): { cta: string; primary: boolean; closed?: ClosedOffer } {
  const t = useTranslations('portal.task.cta');
  const closed = view.myOffer && (CLOSED_OFFERS as readonly string[]).includes(view.myOffer.status) ? (view.myOffer.status as ClosedOffer) : undefined;
  if (view.relation !== 'helper') return { cta: t(view.relation), primary: false };
  if (view.blockedReason) return { cta: t('neighbor'), primary: false };
  if (view.myOffer && !closed) return { cta: t('yourOffer'), primary: false };
  return closed ? { cta: t('offerAgain'), primary: true, closed } : { cta: t('helper'), primary: true };
}

/** What a helper's line under the task says: why they can't offer, their offer's status, or that it ended. */
export function HelperStandingNote({ view, closed, size = 'md' }: { view: PortalTaskView; closed?: ClosedOffer; size?: 'sm' | 'md' }) {
  const findWork = useTranslations('findWork');
  const live = view.myOffer && !closed ? view.myOffer.status : undefined;
  const offerBadge = useOfferStatus(live ?? 'pending', 'helper');
  const text = size === 'sm' ? 'text-[13px]' : 'text-sm';
  if (view.blockedReason) return <p className={cn('flex items-start gap-1.5 text-muted-foreground', text)}><Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{findWork(`blockedReasons.${view.blockedReason}`)}</p>;
  if (live) return <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', text)}><span className="font-medium">{findWork('myOffer')}</span><StatusBadge {...offerBadge} size="sm" /></p>;
  if (closed) return <p className={cn('font-medium', text)}>{findWork(`myOfferClosed.${closed}`)}</p>;
  return null;
}

/**
 * An open task as a card in the neighborhood's feed (completion plan 9.10): who posted it and where (the
 * neighborhood, never closer), the title and the first words, the price, when it is and what kind of job, the
 * neighborhood post it came from, and its next step for this viewer (manage your own, or have a look; a helper's
 * follows find work: make an offer, see theirs, send a new one once it expired, or why it isn't open to them).
 * Offers count live; questions are its discussion.
 */
export function TaskFeedCard({ view, now, visitKey, onSaveTask, headingLevel = 2, compact = false, highlight = [] }: { view: PortalTaskView; now: ISODateTime; visitKey: string; onSaveTask?: ActionHandler<{ taskId: string; saved: boolean }>; headingLevel?: 2 | 3; /** The Feed's smaller card (plan 10.8): one line of facts, no excerpt, so neighbors' posts lead. */ compact?: boolean; /** A search's words, marked (plan 10.23). */ highlight?: readonly string[] }) {
  const t = useTranslations('portal');
  const card = useTranslations('taskCard');
  const { formatDate, formatRelative, formatDateTime, formatTimeRange, dayKey } = useFormat();
  const { task } = view;
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const Icon = categoryIcons[task.categorySlug];
  const { price, note } = useTaskPrice(task);
  const recent = Date.parse(now) - Date.parse(task.postedAt) < NEW_FOR_MS;
  const schedule = task.schedule.flexible
    ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : dayKey(task.schedule.windowStart) === dayKey(task.schedule.windowEnd)
      ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const place = task.location.kind === 'remote' ? t('task.remote') : task.location.areaName;
  const standing = useHelperStanding(view);
  const findWork = useTranslations('findWork');

  if (compact) return <article aria-labelledby={`task-${task.id}`} className="min-w-0 space-y-2 rounded-[1.375rem] border border-border bg-card p-3.5 shadow-card sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 truncate text-xs text-muted-foreground">
        <ClipboardList aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px] text-primary" />
        <span className="font-semibold text-foreground">{task.poster.displayName}</span> {t('task.posted')} · {place} · <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{formatRelative(task.postedAt, now)}</time>
      </p>
      <p className="shrink-0 text-right leading-tight"><span className="font-display text-base font-semibold tabular-nums">{price}</span>{note && <span className="block text-[11px] text-muted-foreground tabular-nums">{note}</span>}</p>
    </div>
    <Heading id={`task-${task.id}`} className="min-w-0 font-display text-[1rem]/6 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
      <Link href={view.href} className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Highlight text={task.title} words={highlight} /></Link>
      <NewSinceBadge postedAt={task.postedAt} recent={recent} visitKey={visitKey} />
    </Heading>
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground tabular-nums">
      <span className="inline-flex items-center gap-1"><Icon aria-hidden="true" className="size-3.5" />{task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : card(`categories.${task.categorySlug}`)}</span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3.5" />{schedule}</span>
    </p>
    {view.fromPost && <Link href={routes.app.communityPost(view.fromPost.id)} className="flex min-w-0 items-center gap-1.5 rounded-sm text-[13px] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      <MessagesSquare aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 text-muted-foreground">{t('task.fromPost')}:</span>
      <span className="truncate font-medium">{view.fromPost.title}</span>
    </Link>}
    {view.relation === 'helper' && <HelperStandingNote view={view} closed={standing.closed} size="sm" />}
    <div className="flex flex-wrap items-center gap-2 pt-0.5">
      <Link href={view.href} className={buttonVariants({ size: 'sm', variant: standing.primary ? 'default' : 'outline', className: 'min-h-9' })}>{standing.cta}</Link>
      {onSaveTask && view.saved !== undefined && <SaveButton id={task.id} title={task.title} saved={view.saved} target={{ kind: 'task', onSave: onSaveTask }} compact="phone" />}
      <p className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {standing.closed && task.offerCount === 0 ? <span className="tabular-nums">{findWork('noLiveOffers')}</span> : <LiveOfferCount taskId={task.id} offerCount={task.offerCount} renderedAt={now} />}
        {view.questionCount > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><MessageCircleQuestion aria-hidden="true" className="size-3.5" />{t('task.questions', { count: view.questionCount })}</span>}
      </p>
    </div>
  </article>;

  return <article aria-labelledby={`task-${task.id}`} className="min-w-0 space-y-3 rounded-[1.375rem] border border-border bg-card p-4 shadow-card sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <InitialsAvatar initials={task.poster.initials} size="sm" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm"><span className="font-semibold">{task.poster.displayName}</span> <span className="text-muted-foreground">{t('task.posted')}</span></p>
          <p className="truncate text-xs text-muted-foreground">
            {task.location.kind === 'remote' ? <Laptop aria-hidden="true" className="mr-1 inline size-3 align-[-1px]" /> : <MapPin aria-hidden="true" className="mr-1 inline size-3 align-[-1px]" />}
            {place} · <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{formatRelative(task.postedAt, now)}</time>
          </p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background"><ClipboardList aria-hidden="true" className="size-3" />{t('task.flair')}</span>
    </div>

    {/* The title and the price share a line; the first words use the card's whole width under them. */}
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-4">
        <Heading id={`task-${task.id}`} className="min-w-0 font-display text-[1.0625rem]/6 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
          <Link href={view.href} className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Highlight text={task.title} words={highlight} /></Link>
          <NewSinceBadge postedAt={task.postedAt} recent={recent} visitKey={visitKey} />
        </Heading>
        <p className="shrink-0 text-right leading-tight">
          <span className="block font-display text-xl font-semibold tracking-[-0.01em] tabular-nums">{price}</span>
          {note && <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{note}</span>}
        </p>
      </div>
      <p className="line-clamp-2 text-[15px]/6 text-foreground/80 [overflow-wrap:anywhere]">{task.excerpt}</p>
    </div>

    <ul className="flex flex-wrap gap-1.5">
      <li className={factClass}><Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />{task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : card(`categories.${task.categorySlug}`)}</li>
      <li className={cn(factClass, 'tabular-nums')}><CalendarDays aria-hidden="true" className="size-3.5 text-muted-foreground" />{schedule}</li>
    </ul>

    {view.fromPost && <Link href={routes.app.communityPost(view.fromPost.id)} className="flex min-w-0 items-center gap-2 rounded-xl px-0.5 text-[13px] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      <MessagesSquare aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="shrink-0 text-muted-foreground">{t('task.fromPost')}:</span>
      <span className="truncate font-medium">{view.fromPost.title}</span>
    </Link>}

    {view.relation === 'helper' && <HelperStandingNote view={view} closed={standing.closed} />}

    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
      <Link href={view.href} className={buttonVariants({ size: 'sm', variant: standing.primary ? 'default' : 'outline', className: 'min-h-9' })}>{standing.cta}</Link>
      {onSaveTask && view.saved !== undefined && <SaveButton id={task.id} title={task.title} saved={view.saved} target={{ kind: 'task', onSave: onSaveTask }} compact="phone" />}
      <p className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        {/* Live offers only: an expired one of the helper's own isn't "no offers yet" (audit M21). */}
        {standing.closed && task.offerCount === 0 ? <span className="tabular-nums">{findWork('noLiveOffers')}</span> : <LiveOfferCount taskId={task.id} offerCount={task.offerCount} renderedAt={now} />}
        {view.questionCount > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><MessageCircleQuestion aria-hidden="true" className="size-3.5" />{t('task.questions', { count: view.questionCount })}</span>}
      </p>
    </div>
  </article>;
}
