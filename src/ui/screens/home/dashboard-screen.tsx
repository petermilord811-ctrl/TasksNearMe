import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, BellDot, CalendarDays, CheckCheck, Inbox, MapPinned, Plus, Search, SearchX, SlidersHorizontal, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type DashboardData, type DashboardHandlers, type DashboardTab, type ISODateTime } from '@/contracts';
import { marketClockTime } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { WaitingForCityNote } from '@/ui/components/helper/waiting-for-city';
import { Money } from '@/ui/components/money/money';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import type { AiAnswerState } from './ai-answer';
import { AttentionList } from './attention-list';
import { DashboardCards, DashboardRows } from './dashboard-item';
import { DashboardMapView } from './dashboard-map';
import { DashboardSearch } from './dashboard-search';
import { DashboardToolbar } from './dashboard-toolbar';
import { dashboardBase, seeAllHref } from './links';

export interface DashboardScreenProps {
  data: DashboardData;
  now: ISODateTime;
  /** AI search (absent: Ask AI isn't offered). */
  handlers?: DashboardHandlers;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
  /** Previews: an AI answer already on screen. */
  initialAiAnswer?: AiAnswerState;
}

const SIDE_SCROLL = '-mx-gutter -my-1 overflow-x-auto px-gutter py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const EDGE_FADE = 'linear-gradient(to right, transparent, #000 var(--spacing-gutter, 1rem), #000 calc(100% - var(--spacing-gutter, 1rem)), transparent)';
const edgeFade: CSSProperties = { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE };

function SectionTitle({ id, children }: { id: string; children: string }) {
  return <h2 id={id} className="font-display text-lg leading-7 font-semibold tracking-[-0.015em]">{children}</h2>;
}

/** Earnings at a glance (helpers): what's coming and what's on the way to the bank, opening Earnings. */
function EarningsGlance({ earnings }: { earnings: NonNullable<DashboardData['earnings']> }) {
  const t = useTranslations('home');
  return <section aria-labelledby="home-earnings" className="shrink-0">
    <h2 id="home-earnings" className="sr-only">{t('sections.earnings')}</h2>
    <Link href={routes.app.earnings()} aria-describedby="home-earnings" className="group/earn flex items-center gap-3.5 rounded-[1.375rem] border bg-card py-2.5 pr-3 pl-3.5 shadow-card transition-[translate] duration-200 ease-[var(--ease-out)] hover:-translate-y-px motion-reduce:hover:translate-y-0">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Wallet className="size-5" /></span>
      <dl className="flex min-w-0 flex-1 items-center gap-4">
        {/* On phones the longer label takes two even lines and "On the way" keeps its one. */}
        <div className="min-w-0"><dt className="text-xs text-balance text-muted-foreground">{t('earnings.upcoming')}</dt><dd className="font-display text-lg leading-6 font-semibold"><Money cents={earnings.upcomingCents} /></dd></div>
        <div className="shrink-0 border-l pl-4"><dt className="text-xs whitespace-nowrap text-muted-foreground">{t('earnings.onTheWay')}</dt><dd className="font-display text-lg leading-6 font-semibold"><Money cents={earnings.onTheWayCents} /></dd></div>
      </dl>
      <span className="sr-only">{t('earnings.link')}</span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/earn:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  </section>;
}

/** The lists as tabs, each with its count under the filters (they're also the dashboard's at-a-glance numbers). */
function ListTabs({ data }: { data: DashboardData }) {
  const t = useTranslations('home.lists');
  const base = dashboardBase(data.query);
  return <nav aria-label={t('tabsLabel')} className={SIDE_SCROLL} style={edgeFade}>
    <ul className="flex w-max gap-1 rounded-full bg-muted p-1">
      {data.tabs.map((tab) => {
        const current = tab.id === data.query.tab;
        const label = t(`tabs.${tab.id}`);
        return <li key={tab.id}>
          {/* Named by what it shows ("Tasks 5"), then "items" for screen readers. */}
          <Link href={routes.app.home({ ...base, tab: tab.id })} scroll={false} aria-current={current ? 'true' : undefined}
            className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full py-1.5 pr-1.5 pl-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out)] sm:gap-2 sm:pr-2 sm:pl-4', current ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground')}>
            {label}{' '}
            <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums', current ? 'bg-primary text-primary-foreground' : 'bg-card/70 text-foreground')}>{tab.count}</span>
            {' '}<span className="sr-only">{t('tabItems', { count: tab.count })}</span>
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}

/** Why a list is empty, and the way on: a search with no matches, filters that match nothing, or nothing yet. */
function EmptyList({ data, tab }: { data: DashboardData; tab: DashboardTab }) {
  const t = useTranslations('home.empty');
  const { query } = data;
  const base = dashboardBase(query);
  if (query.q) {
    return <EmptyState headingLevel={3} icon={<SearchX />} title={t('search.title', { q: query.q })} body={t(data.aiSearch.allowed ? 'search.bodyAi' : 'search.body')}
      action={data.mode === 'poster' && data.sides.client ? { label: t('search.post', { q: query.q }), href: routes.app.newTask({ describe: query.q }) } : { label: t('search.action'), href: routes.app.home({ ...base, q: undefined }) }} />;
  }
  if (query.status !== 'active' || query.date !== 'any' || query.category) {
    return <EmptyState headingLevel={3} icon={<SlidersHorizontal />} title={t('filtered.title')} body={t('filtered.body')} action={{ label: t('filtered.action'), href: routes.app.home({ tab: query.tab, view: query.view }) }} />;
  }
  const side = data.mode === 'helper' || !data.sides.client ? 'helper' : 'client';
  switch (tab) {
    case 'tasks':
      return <EmptyState headingLevel={3} icon={<Plus />} title={t('tasks.title')} body={t('tasks.body')} action={{ label: t('tasks.action'), href: routes.app.newTask() }} />;
    case 'offers':
      return <EmptyState headingLevel={3} icon={<Inbox />} title={t(`offers.${side}.title`)} body={t(`offers.${side}.body`)} action={{ label: t(`offers.${side}.action`), href: side === 'client' ? routes.app.tasks() : routes.app.findWork() }} />;
    case 'bookings':
      return <EmptyState headingLevel={3} icon={<CalendarDays />} title={t(`bookings.${side}.title`)} body={t(`bookings.${side}.body`)} action={{ label: t(`bookings.${side}.action`), href: side === 'client' ? routes.app.helpers() : routes.app.findWork() }} />;
    case 'nearby':
      return data.waitingFor
        ? <EmptyState headingLevel={3} icon={<MapPinned />} title={t('nearby.waitingTitle', { city: data.waitingFor.city })} body={t('nearby.waitingBody')} />
        : <EmptyState headingLevel={3} icon={<Search />} title={t('nearby.title')} body={t('nearby.body')} action={{ label: t('nearby.action'), href: routes.app.findWork() }} />;
  }
}

/** The current list: the tabs, the filters and the view switch, the items as rows, cards or a map, and its full page. */
function DashboardLists({ data, liveMap }: { data: DashboardData; liveMap: boolean }) {
  const t = useTranslations('home');
  const { query, items } = data;
  const count = data.tabs.find((tab) => tab.id === query.tab)?.count ?? items.length;
  return <section aria-labelledby="home-lists" className="space-y-3">
    <h2 id="home-lists" className="sr-only">{t('sections.lists')}</h2>
    <ListTabs data={data} />
    <DashboardToolbar data={data} />
    {query.q && <p aria-live="polite" className="px-1 text-sm text-muted-foreground tabular-nums">{t('search.matches', { count, q: query.q })}</p>}
    {items.length === 0
      ? <EmptyList data={data} tab={query.tab} />
      : query.view === 'map'
        ? <DashboardMapView data={data} live={liveMap} />
        : query.view === 'cards' ? <DashboardCards items={items} /> : <DashboardRows items={items} />}
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
      {count > items.length ? <p className="text-sm text-muted-foreground tabular-nums">{t('lists.showing', { shown: items.length, count })}</p> : <span />}
      <Link href={seeAllHref(data.seeAll)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {t(`lists.seeAll.${data.seeAll.kind}`)}<ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  </section>;
}

/** A client's first visit (J-C1): the way in, in place of empty lists, their filters and an all-caught-up note. */
function FirstTaskCard() {
  const t = useTranslations('home.firstRun');
  return <section aria-labelledby="home-first-task" className="relative isolate overflow-hidden rounded-[1.375rem] border border-foreground/[0.08] bg-card p-5 shadow-[0_18px_40px_-28px_rgb(40_20_5/0.35)] sm:p-6 dark:border-white/[0.08]">
    <span aria-hidden="true" className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-soft text-primary [&_svg]:size-6"><Plus /></span>
    <h2 id="home-first-task" className="font-display text-xl leading-tight font-semibold tracking-[-0.015em]">{t('title')}</h2>
    <p className="mt-2 max-w-prose text-[15px] leading-6 text-pretty text-muted-foreground">{t('body')}</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <Link href={routes.app.newTask()} className={buttonVariants()}>{t('post')}</Link>
      <Link href={routes.app.helpers()} className={buttonVariants({ variant: 'outline' })}>{t('browse')}</Link>
    </div>
  </section>;
}

/**
 * The signed-in home as a dashboard (completion plan 9.9; docs/ui/dashboard-9.9.md): the greeting and the day in one
 * line (and a helper's earnings), the search (and AI search where the plan allows it), what needs the person, then
 * their tasks, offers, bookings and nearby tasks as compact lists with a few filters and a view switch. Everything
 * shown is decided by the app; the URL holds the filters.
 */
export function DashboardScreen({ data, now, handlers, liveMap = true, initialAiAnswer }: DashboardScreenProps) {
  const t = useTranslations('home');
  // "Good morning" on the person's own clock (their home market's, completion plan 8.1).
  const { timeZone } = useFormat();
  const hour = Number(marketClockTime(now, timeZone).split(':')[0]);
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return <div className="mx-auto w-full max-w-content space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.125rem]">{t(`greeting.${period}`, { firstName: data.firstName })}</h1>
        {/* Two facts side by side, each whole when the line wraps (no separator left dangling). A first visit has neither. */}
        {!data.firstRun && <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] leading-6 text-muted-foreground">
          <li className={cn('inline-flex items-center gap-1.5', data.summary.needsYou > 0 && 'font-semibold text-foreground')}>
            <BellDot aria-hidden="true" className={cn('size-4 shrink-0', data.summary.needsYou > 0 && 'text-primary')} />{t('summary.needsYou', { count: data.summary.needsYou })}
          </li>
          <li className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{t('summary.upcoming', { count: data.summary.upcoming })}</li>
        </ul>}
      </div>
      {data.earnings && <EarningsGlance earnings={data.earnings} />}
    </header>

    {data.firstRun && <FirstTaskCard />}

    {/* What needs the person first; then the search, right above the lists it searches. */}
    {(!data.firstRun || data.attention.length > 0) && <section aria-labelledby="home-attention" className="space-y-3">
      <SectionTitle id="home-attention">{t('sections.attention')}</SectionTitle>
      {data.attention.length > 0
        ? <AttentionList items={data.attention} now={now} />
        : <p className="flex items-center gap-2.5 rounded-[1.375rem] border border-dashed bg-card/60 px-4 py-3 text-sm text-muted-foreground"><CheckCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('caughtUp')}</p>}
    </section>}

    {data.waitingFor && <WaitingForCityNote waiting={data.waitingFor} />}

    <DashboardSearch data={data} {...(handlers?.onAiSearch ? { onAiSearch: handlers.onAiSearch } : {})} {...(initialAiAnswer ? { initialAnswer: initialAiAnswer } : {})} />

    {(!data.firstRun || data.query.q) && <DashboardLists data={data} liveMap={liveMap} />}
  </div>;
}
