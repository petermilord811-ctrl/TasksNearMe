import Link from 'next/link';
import { CalendarDays, ChevronRight, Hammer, Laptop, Leaf, Package, Plus, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CategorySlug, type ISODateTime, type MyTasksPageData, type OwnerTaskRow } from '@/contracts';
import { formatDate, formatDateTime, formatHours, formatMoney, formatRelative, formatTimeRange, marketDayKey } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useTaskStatus } from '@/ui/components/status/use-status';
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

export interface MyTasksScreenProps {
  data: MyTasksPageData;
  now: ISODateTime;
  /** Opens a particular tab in the preview gallery. */
  initialTab?: TaskTab;
}

function TaskRow({ task, tab, now }: { task: OwnerTaskRow; tab: TaskTab; now: ISODateTime }) {
  const t = useTranslations('myTasks');
  const card = useTranslations('taskCard');
  const status = useTaskStatus(task.status);
  const Icon = categoryIcons[task.categorySlug];
  const schedule = task.schedule.flexible
    ? card('flexibleSchedule', { date: formatDate(task.schedule.windowStart) })
    : marketDayKey(task.schedule.windowStart) === marketDayKey(task.schedule.windowEnd)
      ? card('scheduledWindow', { date: formatDate(task.schedule.windowStart), window: formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd) })
      : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd);
  const budget = task.budget.type === 'fixed'
    ? formatMoney(task.budget.priceCents)
    : card('hourlyBudget', { rate: formatMoney(task.budget.rateCents), cap: formatHours(task.budget.hoursCap) });
  const href = tab === 'booked' && task.bookingId ? routes.app.booking(task.bookingId) : routes.app.task(task.id);
  const titleId = `task-${tab}-${task.id}`;

  return <article aria-labelledby={titleId} className="group relative min-w-0 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-secondary-foreground">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><Icon aria-hidden="true" className="size-5" /></span>
          {card(`categories.${task.categorySlug}`)}
        </p>
        <StatusBadge {...status} />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-[17px]/6 font-semibold group-hover:text-primary md:text-lg/6.5"><Link href={href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{task.title}</Link></h2>
        <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-3 flex items-start gap-2 text-sm tabular-nums text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{schedule}</span></p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="space-x-2"><span className="text-sm text-muted-foreground">{t('budget')}</span><span className="font-semibold tabular-nums">{budget}</span></p>
        <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums"><span>{card('offers', { count: task.offerCount })}</span>{task.newOfferCount > 0 && <StatusBadge tone="brand" label={t('newOffers', { count: task.newOfferCount })} />}</div>
      </div>
      <p className="mt-4 text-sm tabular-nums text-muted-foreground"><time dateTime={task.postedAt} title={formatDateTime(task.postedAt)}>{card('posted', { relative: formatRelative(task.postedAt, now) })}</time></p>
  </article>;
}

export function MyTasksScreen({ data, now, initialTab = 'open' }: MyTasksScreenProps) {
  const t = useTranslations('myTasks');
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')}>
      {data.open.length > 0 && <Link href={routes.app.newTask()} className={buttonVariants()}><Plus aria-hidden="true" />{t('postTask')}</Link>}
    </PageHeader>
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="tabular-nums sm:min-w-28">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length > 0
          ? <ul className="space-y-4">{data[tab].map((task) => <li key={task.id}><TaskRow task={task} tab={tab} now={now} /></li>)}</ul>
          : <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
      </TabsContent>)}
    </Tabs>
  </div>;
}
