import Link from 'next/link';
import { Clock, Plus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type MyTasksPageData, type OwnerTaskRow, type PricingInput } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { CompactList, CompactRow, DayTile, ListGroupLabel, RowFact, RowMoney } from '@/ui/components/layout/compact-list';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useTaskStatus } from '@/ui/components/status/use-status';
import { CATEGORY_ICONS } from '@/ui/components/tasks/category-icons';
import { groupByDay, useDayLabel } from '@/ui/components/time/day-groups';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';

const tabs = ['open', 'booked', 'past'] as const;
type TaskTab = (typeof tabs)[number];

export interface MyTasksScreenProps {
  data: MyTasksPageData;
  now: ISODateTime;
  /** Opens a particular tab in the preview gallery; by default the first tab with tasks in it. */
  initialTab?: TaskTab;
}

/** The budget as the row's money: "$60.00", or "$40.00/h" with "up to 4 h". */
function useBudgetWords() {
  const card = useTranslations('taskCard');
  return (pricing: PricingInput) => (pricing.type === 'fixed'
    ? { amount: formatMoney(pricing.priceCents) }
    : { amount: `${formatMoney(pricing.rateCents)}${card('perHour')}`, note: card('upToHours', { hours: formatHours(pricing.hoursCap) }) });
}

/** Where a row's "needs you" step leads: the booking for its own steps, helpers to invite, or the task's offers. */
function attentionHref(row: OwnerTaskRow): string {
  const attention = row.attention;
  if (attention?.bookingId && (attention.kind === 'finish_payment' || attention.kind === 'retry_payment' || attention.kind === 'review_work')) return routes.app.booking(attention.bookingId);
  if (attention?.kind === 'no_offers') return routes.app.helpers({ category: row.categorySlug });
  return routes.app.task(row.id);
}

/**
 * One task as a compact row (plan 9.14, audit M27): the day, the title (the row opens the task, or its booking once
 * booked), its status, what, when and with whom, the offers, and the budget. What needs the poster shows on the row
 * itself, with the step that resolves it, instead of in a second list above.
 */
export function TaskRow({ task, tab, now, headingLevel = 2 }: { task: OwnerTaskRow; tab: TaskTab; now: ISODateTime; headingLevel?: 2 | 3 }) {
  const { formatDate, formatDateTime, formatRelative, formatTime, formatTimeRange } = useFormat();
  const t = useTranslations('myTasks');
  const card = useTranslations('taskCard');
  const status = useTaskStatus(task.status);
  const budget = useBudgetWords()(task.budget);
  const CategoryIcon = CATEGORY_ICONS[task.categorySlug];
  const booked = tab === 'booked' && task.booking;
  // The day is in the tile: the line says the time (a window over several days names its days).
  const when = booked
    ? formatTime(task.booking!.start)
    : task.schedule.flexible
      ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const href = tab === 'booked' && task.bookingId ? routes.app.booking(task.bookingId) : routes.app.task(task.id);
  const newest = tab === 'open' ? task.newestOffer : undefined;
  const attention = task.attention;
  const needs = useTranslations('myTasks.needsYou');
  const priceOf = (pricing: PricingInput) => (pricing.type === 'fixed' ? formatMoney(pricing.priceCents) : card('hourlyBudget', { rate: formatMoney(pricing.rateCents), cap: formatHours(pricing.hoursCap) }));

  return <CompactRow
    titleId={`task-${tab}-${task.id}`}
    title={task.title}
    href={href}
    headingLevel={headingLevel}
    tone={attention ? 'attention' : 'default'}
    leading={<DayTile at={booked ? task.booking!.start : task.schedule.windowStart} />}
    facts={<>
      <StatusBadge size="sm" {...status} />
      <RowFact icon={CategoryIcon}>{card(`categories.${task.categorySlug}`)}</RowFact>
      <RowFact icon={Clock} className="tabular-nums">{when}</RowFact>
      {booked && <RowFact icon={UserRound}>{t('withHelper', { name: task.booking!.helper.displayName })}</RowFact>}
      {/* "No offers after a day" already says it on its own line. */}
      {tab === 'open' && attention?.kind !== 'no_offers' && <span className="tabular-nums">{card('offers', { count: task.offerCount })}</span>}
      {tab === 'open' && task.newOfferCount > 0 && <StatusBadge size="sm" tone="brand" label={t('newOffers', { count: task.newOfferCount })} />}
      {tab === 'open' && <time dateTime={task.postedAt} title={formatDateTime(task.postedAt)} className="tabular-nums">{card('posted', { relative: formatRelative(task.postedAt, now) })}</time>}
    </>}
    trailing={<RowMoney caption={t('budget')} amount={budget.amount} note={budget.note} />}
    trailingInline={budget.note ? `${budget.amount} · ${budget.note}` : budget.amount}
    note={(attention || newest) && <div className="space-y-1">
      {attention && <p className="font-medium text-foreground tabular-nums">{needs(`messages.${attention.kind}`, {
        helper: task.booking?.helper.displayName ?? '',
        count: attention.kind === 'new_offers' ? task.newOfferCount : task.offerCount,
        relative: attention.dueAt ? formatRelative(attention.dueAt, now) : '',
        date: attention.dueAt ? formatDateTime(attention.dueAt) : '',
      })}</p>}
      {newest && <p className="flex min-w-0 items-center gap-2 text-muted-foreground tabular-nums">
        <InitialsAvatar initials={newest.helper.initials} photo={newest.helper.photo} size="sm" />
        <span className="min-w-0">
          {t('newestOffer', { name: newest.helper.displayName, price: priceOf(newest.pricing) })}
          {newest.helper.rating && <> · {t('rating', { rating: newest.helper.rating.average.toFixed(1) })}</>}
          {' · '}<time dateTime={newest.submittedAt} title={formatDateTime(newest.submittedAt)}>{formatRelative(newest.submittedAt, now)}</time>
        </span>
      </p>}
    </div>}
    action={attention && <Link href={attentionHref(task)} className={cn(buttonVariants({ size: 'sm', variant: attention.kind === 'no_offers' || attention.kind === 'new_offers' ? 'outline' : 'default' }), 'h-9')}>
      {needs(`actions.${attention.kind}`)}<span className="sr-only">{needs('for', { title: task.title })}</span>
    </Link>}
  />;
}

/**
 * The poster's tasks in three tabs, open, booked and past, as compact rows. Whatever needs the poster (new offers, a
 * task about to close, work to review, a payment to finish, a task without offers) is marked on its own row with the
 * step that resolves it, and each tab says how many need them.
 */
export function MyTasksScreen({ data, now, initialTab }: MyTasksScreenProps) {
  const t = useTranslations('myTasks');
  const { dayKey } = useFormat();
  const dayLabel = useDayLabel(dayKey(now));
  // The first tab with tasks in it, as Bookings and My offers do; a tab's badge says when something there needs you.
  const openTab = initialTab ?? tabs.find((tab) => data[tab].length > 0) ?? 'open';
  const needing = (tab: TaskTab) => data[tab].filter((row) => row.attention).length;
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')}>
      {data.open.length > 0 && <Link href={routes.app.newTask()} className={buttonVariants()}><Plus aria-hidden="true" />{t('postTask')}</Link>}
    </PageHeader>
    <Tabs defaultValue={openTab} className="gap-5">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => {
          const count = needing(tab);
          return <TabsTrigger key={tab} value={tab} className="gap-1.5 tabular-nums max-sm:flex-auto max-sm:px-2.5 sm:min-w-28">
            {t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}
            {count > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-badge-warning px-1.5 text-[11px] leading-5 font-bold text-badge-warning-foreground"><span aria-hidden="true">{count}</span><span className="sr-only">, {t('needYou', { count })}</span></span>}
          </TabsTrigger>;
        })}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length === 0
          ? <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={{ label: t('postTask'), href: routes.app.newTask() }} />
          : tab === 'booked'
            ? <div className="space-y-5">{groupByDay(data.booked, (task) => task.booking?.start ?? task.schedule.windowStart, dayKey).map((group) => <section key={group.day} aria-labelledby={`booked-${group.day}`} className="space-y-2">
                <ListGroupLabel id={`booked-${group.day}`}>{dayLabel(group.day)}</ListGroupLabel>
                <CompactList>{group.items.map((task) => <li key={task.id}><TaskRow task={task} tab={tab} now={now} headingLevel={3} /></li>)}</CompactList>
              </section>)}</div>
            : <CompactList>{data[tab].map((task) => <li key={task.id}><TaskRow task={task} tab={tab} now={now} /></li>)}</CompactList>}
      </TabsContent>)}
    </Tabs>
  </div>;
}
