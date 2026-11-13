import Link from 'next/link';
import { CalendarDays, ChevronRight, ClipboardCheck, Clock, CreditCard, Hammer, Inbox, Laptop, Leaf, Package, Plus, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type ISODateTime, type MyTasksPageData, type OwnerTaskAttention, type OwnerTaskRow, type PricingInput } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useTaskStatus } from '@/ui/components/status/use-status';
import { groupByDay, useDayLabel } from '@/ui/components/time/day-groups';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';

const tabs = ['open', 'booked', 'past'] as const;
type TaskTab = (typeof tabs)[number];
const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};
const attentionIcons: Record<OwnerTaskAttention, LucideIcon> = {
  finish_payment: CreditCard,
  review_work: ClipboardCheck,
  choose_soon: Clock,
  new_offers: Inbox,
  no_offers: UserPlus,
};

export interface MyTasksScreenProps {
  data: MyTasksPageData;
  now: ISODateTime;
  /** Opens a particular tab in the preview gallery. */
  initialTab?: TaskTab;
}

function usePriceLabel() {
  const card = useTranslations('taskCard');
  return (pricing: PricingInput) => (pricing.type === 'fixed' ? formatMoney(pricing.priceCents) : card('hourlyBudget', { rate: formatMoney(pricing.rateCents), cap: formatHours(pricing.hoursCap) }));
}

export function TaskRow({ task, tab, now, headingLevel = 2 }: { task: OwnerTaskRow; tab: TaskTab; now: ISODateTime; headingLevel?: 2 | 3 }) {
  const t = useTranslations('myTasks');
  const card = useTranslations('taskCard');
  const status = useTaskStatus(task.status);
  const priceLabel = usePriceLabel();
  const Icon = categoryIcons[task.categorySlug];
  const schedule = task.booking && tab === 'booked'
    ? t('bookedWith', { time: formatDateTime(task.booking.start), name: task.booking.helper.displayName })
    : task.schedule.flexible
      ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
      : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
        ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
        : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const href = tab === 'booked' && task.bookingId ? routes.app.booking(task.bookingId) : routes.app.task(task.id);
  const titleId = `task-${tab}-${task.id}`;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const newest = tab === 'open' ? task.newestOffer : undefined;

  return <article aria-labelledby={titleId} className="group relative min-w-0 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><Icon aria-hidden="true" className="size-5" /></span>
          {card(`categories.${task.categorySlug}`)}
        </p>
        <StatusBadge {...status} />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <Heading id={titleId} className="text-[17px]/6 font-semibold group-hover:text-primary md:text-lg/6.5"><Link href={href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{task.title}</Link></Heading>
        <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-3 flex items-start gap-2 text-sm tabular-nums text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{schedule}</span></p>
      {newest && <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
        <InitialsAvatar initials={newest.helper.initials} size="sm" />
        <p className="min-w-0 text-sm tabular-nums">
          <span className="font-medium">{t('newestOffer', { name: newest.helper.displayName, price: priceLabel(newest.pricing) })}</span>
          {newest.helper.rating && <span className="text-muted-foreground"> · {t('rating', { rating: newest.helper.rating.average.toFixed(1) })}</span>}
          <span className="text-muted-foreground"> · <time dateTime={newest.submittedAt} title={formatDateTime(newest.submittedAt)}>{formatRelative(newest.submittedAt, now)}</time></span>
        </p>
      </div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="space-x-2"><span className="text-sm text-muted-foreground">{t('budget')}</span><span className="font-semibold tabular-nums">{priceLabel(task.budget)}</span></p>
        <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums"><span>{card('offers', { count: task.offerCount })}</span>{task.newOfferCount > 0 && <StatusBadge tone="brand" label={t('newOffers', { count: task.newOfferCount })} />}</div>
      </div>
      <p className="mt-4 text-sm tabular-nums text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{card('posted', { relative: formatRelative(task.postedAt, now) })}</time></p>
  </article>;
}

/** Where each "Needs you" item leads: the booking for its own steps, helpers to invite, or the task's offers. */
function attentionHref(row: OwnerTaskRow): string {
  const attention = row.attention;
  if (attention?.bookingId && (attention.kind === 'finish_payment' || attention.kind === 'review_work')) return routes.app.booking(attention.bookingId);
  if (attention?.kind === 'no_offers') return routes.app.helpers({ category: row.categorySlug });
  return routes.app.task(row.id);
}

/** What needs the poster first: one line each, with the step that resolves it. */
function NeedsYou({ rows, now }: { rows: OwnerTaskRow[]; now: ISODateTime }) {
  const t = useTranslations('myTasks.needsYou');
  return <section aria-labelledby="needs-you-title" className="space-y-2 rounded-xl border border-warning/40 bg-card p-4 shadow-card md:p-5">
    <h2 id="needs-you-title" className="font-heading text-lg font-semibold">{t('title', { count: rows.length })}</h2>
    <ul className="divide-y divide-border">{rows.map((row) => {
      if (!row.attention) return null;
      const { kind, dueAt } = row.attention;
      const Icon = attentionIcons[kind];
      const values = {
        helper: row.booking?.helper.displayName ?? '',
        count: kind === 'new_offers' ? row.newOfferCount : row.offerCount,
        relative: dueAt ? formatRelative(dueAt, now) : '',
        date: dueAt ? formatDateTime(dueAt) : '',
      };
      return <li key={row.id} className="flex flex-col gap-3 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-medium">{row.title}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{t(`messages.${kind}`, values)}</p>
          </div>
        </div>
        <Link href={attentionHref(row)} className={cn(buttonVariants({ size: 'sm', variant: kind === 'no_offers' ? 'outline' : 'default' }), 'shrink-0 self-start sm:self-center')}>
          {t(`actions.${kind}`)}<span className="sr-only">{t('for', { title: row.title })}</span>
        </Link>
      </li>;
    })}</ul>
  </section>;
}

/**
 * The poster's tasks: what needs them first (new offers, a task about to close, work to review, a payment
 * to finish, a task without offers), then open, booked and past tabs. Open tasks show their newest offer;
 * booked tasks go by day.
 */
export function MyTasksScreen({ data, now, initialTab = 'open' }: MyTasksScreenProps) {
  const t = useTranslations('myTasks');
  const dayLabel = useDayLabel(marketDayKey(now));
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')}>
      {data.open.length > 0 && <Link href={routes.app.newTask()} className={buttonVariants()}><Plus aria-hidden="true" />{t('postTask')}</Link>}
    </PageHeader>
    {data.needsYou.length > 0 && <NeedsYou rows={data.needsYou} now={now} />}
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="tabular-nums sm:min-w-28">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length === 0
          ? <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={{ label: t('postTask'), href: routes.app.newTask() }} />
          : tab === 'booked'
            ? <div className="space-y-6">{groupByDay(data.booked, (task) => task.booking?.start ?? task.schedule.windowStart).map((group) => <section key={group.day} aria-labelledby={`booked-${group.day}`} className="space-y-3">
                <h2 id={`booked-${group.day}`} className="text-sm font-semibold text-muted-foreground">{dayLabel(group.day)}</h2>
                <ul className="space-y-4">{group.items.map((task) => <li key={task.id}><TaskRow task={task} tab={tab} now={now} headingLevel={3} /></li>)}</ul>
              </section>)}</div>
            : <ul className="space-y-4">{data[tab].map((task) => <li key={task.id}><TaskRow task={task} tab={tab} now={now} /></li>)}</ul>}
      </TabsContent>)}
    </Tabs>
  </div>;
}
