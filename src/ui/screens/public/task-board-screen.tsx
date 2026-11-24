import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpDown, BellRing, Check, ChevronDown, LayoutGrid, List, Lock, Plus, UsersRound, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ISODateTime, TaskBoardPageData, TaskBoardQuery, TaskPublicView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { TASK_BOARD_GROUPS, TASK_BOARD_PRICE_PRESETS, TASK_BOARD_SORTS, TASK_BOARD_VIEWS } from '@/contracts/tasks';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PAGE_TITLE_CLASS } from '@/ui/components/layout/page-header';
import { BoardFilters, activeFilterCount, boardHref } from '@/ui/components/search/board-filters';
import { BoardLive } from '@/ui/components/search/board-live';
import { TaskTypeTiles } from '@/ui/components/search/task-type-tiles';
import { PublicTaskCard } from '@/ui/components/tasks/public-task-card';
import { LastVisitNote } from '@/ui/components/tasks/task-live';
import { TaskRow } from '@/ui/components/tasks/task-row';
import { BoardComposer } from '@/ui/components/tasks/board-composer';
import { NeighborhoodSwitch } from '@/ui/components/portal/neighborhood-switch';
import { NeighborsCard } from '@/ui/screens/home/neighbors-card';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export interface TaskBoardScreenProps { data: TaskBoardPageData; now: ISODateTime }

function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return <nav aria-label={label} className="shrink-0"><ul className="inline-flex rounded-lg bg-foreground/[0.05] p-0.5 dark:bg-white/[0.06]">{children}</ul></nav>;
}

function SegmentLink({ href, selected, label, icon }: { href: string; selected: boolean; label: string; icon?: ReactNode }) {
  return <li><Link href={href} rel="nofollow" aria-current={selected ? 'true' : undefined} title={icon ? label : undefined} className={cn('relative inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring', selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
    {icon ?? (selected && <Check aria-hidden="true" className="size-3.5" />)}
    <span className={icon ? 'sr-only' : undefined}>{label}</span>
  </Link></li>;
}

/** One choice in the sort menu: a full-width row, checked when it's the current one. */
function MenuLink({ href, selected, label }: { href: string; selected: boolean; label: string }) {
  return <li><Link href={href} rel="nofollow" aria-current={selected ? 'true' : undefined} className={cn('flex min-h-10 items-center justify-between gap-3 rounded-md px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', selected ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground')}>
    {label}{selected && <Check aria-hidden="true" className="size-4 text-primary" />}
  </Link></li>;
}

/**
 * Sort and grouping in one menu (audit M19, L10, 2026-11-18): the toolbar keeps this and the view toggle only, so on a
 * phone it fits on one line instead of a sideways row of eight chips cut at the edge. A native <details>, so it works
 * before the page's scripts and without them; each choice is a link, as the chips were.
 */
function SortMenu({ children, summary }: { children: ReactNode; summary: ReactNode }) {
  return <details className="group/sort relative">
    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-foreground/[0.05] px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-ring dark:bg-white/[0.06] [&::-webkit-details-marker]:hidden">
      <ArrowUpDown aria-hidden="true" className="size-4 text-muted-foreground" />{summary}
      <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open/sort:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="absolute right-0 z-30 mt-2 w-60 space-y-2 rounded-xl border border-foreground/[0.08] bg-card p-2 shadow-lg dark:border-white/[0.08]">{children}</div>
  </details>;
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return <nav aria-label={label}><p className="px-2 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">{label}</p><ul>{children}</ul></nav>;
}

function Rows({ tasks, now, showArea = true, visitKey }: { tasks: TaskPublicView[]; now: ISODateTime; showArea?: boolean; visitKey: string }) {
  return <ol className="divide-y divide-foreground/[0.06] dark:divide-white/[0.05]">{tasks.map((task) => <li key={task.id}><TaskRow task={task} now={now} showArea={showArea} visitKey={visitKey} /></li>)}</ol>;
}

const panelClass = 'overflow-hidden rounded-[1.125rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]';
const panelHeadClass = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-foreground/[0.06] bg-foreground/[0.025] px-3 py-2 sm:px-4 dark:border-white/[0.05] dark:bg-white/[0.025]';

/**
 * The public task board, Craigslist-style (completion plan 7.4): dense rows grouped by neighborhood with their
 * counts (or by day, or one list; or cards), a filter column where every option shows its count, the active
 * filters as removable chips, and the market's real numbers. Every view is a link with its own URL.
 */
/**
 * Neighbors beside the board (owner, 2026-11-23): a member sees the newest neighborhood posts near them (the home's
 * "From your neighbors"); everyone else sees what Neighbors is for and the way in. Posts stay members-only.
 */
function BoardNeighbors({ data, now }: { data: TaskBoardPageData; now: ISODateTime }) {
  const t = useTranslations('taskBoard.neighbors');
  if (data.neighbors) return <NeighborsCard neighbors={data.neighbors} now={now} />;
  const member = data.viewer === 'member';
  return <section aria-labelledby="board-neighbors" className="relative isolate overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
    <span aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-16 -z-10 size-48 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><UsersRound className="size-5" /></span>
      <div className="min-w-0 space-y-1.5">
        <h2 id="board-neighbors" className="font-display text-lg leading-7 font-semibold">{t('title', { market: data.market.name })}</h2>
        <p className="text-sm text-muted-foreground">{t(member ? 'bodyMember' : 'body')}</p>
        <Link href={neighborsHrefOf(data)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t(member ? 'open' : 'join')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </div>
    </div>
  </section>;
}

/**
 * Neighbors for this board's place (2026-11-23): one neighborhood chosen here opens Neighbors there (where the slugs
 * match the member's market; otherwise Neighbors starts near them). Signed out, Neighbors asks to sign in first.
 */
function neighborsHrefOf(data: TaskBoardPageData): string {
  return routes.app.community(data.query.areas.length === 1 ? { area: data.query.areas[0] } : {});
}

export function TaskBoardScreen({ data, now }: TaskBoardScreenProps) {
  const t = useTranslations('taskBoard');
  const card = useTranslations('taskCard');
  const saved = useTranslations('savedSearches');
  const { formatDate, dayKey } = useFormat();
  const locale = useLocale();
  const { market, query } = data;
  // This browser's last look at the market's board marks what's new since (completion plan 7.6).
  const visitKey = `board:${market.slug}`;
  const href = (change: Partial<TaskBoardQuery>) => boardHref(data, change);
  // A category's types as tiles (plan 7.5): the ones with open tasks, busiest first, and the chosen one.
  const typeTiles = query.category
    ? data.facets.types
        .filter((type) => type.count > 0 || type.slug === query.type)
        .sort((a, b) => b.count - a.count)
        .map((type) => ({ ...type, href: href({ type: type.slug === query.type ? undefined : type.slug }), selected: type.slug === query.type }))
    : [];
  const filtered = activeFilterCount(query) > 0;
  // On a category's job hub the category is the page, not a filter: with nothing else chosen, an empty hub invites a
  // post like the whole board does (before launch every hub is empty for the public).
  const emptyFiltered = filtered && !(data.heading && query.category && activeFilterCount(query) === 1);
  // A job hub ("moving help jobs near you") is for helpers: becoming one leads, posting follows (audit M42).
  const hub = Boolean(data.heading);
  // A market with no open tasks has nothing to filter, sort or lay out: the empty state takes the width, where the rail
  // (every count 0) ran some 1,600 px below it at 1280 (f7's visual pass of the live site, 2026-11-18). Saving the
  // search and the live status stay: they're how people hear of the first task.
  const nothingYet = data.stats.openCount === 0;
  const tomorrow = dayKey(new Date(new Date(`${data.today}T12:00:00Z`).getTime() + 86_400_000));

  // The filters in effect, each a link that removes it.
  const priceLabel = (() => {
    if (query.minPrice === undefined && query.maxPrice === undefined) return null;
    const preset = TASK_BOARD_PRICE_PRESETS.find((candidate) => ('min' in candidate ? candidate.min : undefined) === query.minPrice && ('max' in candidate ? candidate.max : undefined) === query.maxPrice);
    if (preset) return t(`pricePresets.${preset.key}`);
    if (query.minPrice !== undefined && query.maxPrice !== undefined) return t('priceChip.between', { min: query.minPrice, max: query.maxPrice });
    return query.minPrice !== undefined ? t('priceChip.from', { min: query.minPrice }) : t('priceChip.upTo', { max: query.maxPrice ?? 0 });
  })();
  const chips: { key: string; label: string; href: string }[] = [
    ...(query.category ? [{ key: 'category', label: card(`categories.${query.category}`), href: href({ category: undefined, type: undefined }) }] : []),
    ...(query.category && query.type ? [{ key: 'type', label: card(`types.${query.category}.${query.type}`), href: href({ type: undefined }) }] : []),
    ...(query.q ? [{ key: 'q', label: t('keyword', { q: query.q }), href: href({ q: undefined }) }] : []),
    ...query.areas.map((slug) => ({ key: `area-${slug}`, label: data.facets.areas.find((area) => area.slug === slug)?.name ?? slug, href: href({ areas: query.areas.filter((other) => other !== slug) }) })),
    ...(priceLabel ? [{ key: 'price', label: priceLabel, href: href({ minPrice: undefined, maxPrice: undefined }) }] : []),
    ...(query.pricing ? [{ key: 'pricing', label: t(`pricingOptions.${query.pricing}`), href: href({ pricing: undefined }) }] : []),
    ...(query.when !== 'any' ? [{ key: 'when', label: t(`whenOptions.${query.when}`), href: href({ when: 'any' }) }] : []),
    ...query.times.map((time) => ({ key: `time-${time}`, label: t(`timeOptions.${time}`), href: href({ times: query.times.filter((other) => other !== time) }) })),
    ...(query.posted ? [{ key: 'posted', label: t(`postedOptions.${query.posted}`), href: href({ posted: undefined }) }] : []),
    ...(query.few ? [{ key: 'few', label: t('few'), href: href({ few: false }) }] : []),
    ...(query.remoteOnly ? [{ key: 'remote', label: t('remoteOnly'), href: href({ remoteOnly: false }) }] : []),
  ];

  // Grouped by day when asked (one list, in the order the sort gives).
  const dayGroups = query.group === 'day' && query.view === 'list' && !data.sections
    ? data.tasks.reduce<{ day: string; tasks: TaskPublicView[] }[]>((groups, task) => {
        const day = dayKey(task.schedule.windowStart);
        const last = groups.at(-1);
        if (last && last.day === day) last.tasks.push(task);
        else groups.push({ day, tasks: [task] });
        return groups;
      }, [])
    : null;
  const dayLabel = (day: string, sample: TaskPublicView) => (day === data.today ? t('today') : day === tomorrow ? t('tomorrow') : formatDate(sample.schedule.windowStart));

  // Save this view and get alerts when a new task fits (completion plan 7.10); signing in comes first.
  // `compact`: on phones the bell alone (its name stays "Save this search"), beside the sort and the view (2026-11-24).
  const saveSearch = (compact: boolean) => <Link href={routes.app.newSavedSearch(routes.taskBoard(market.slug, { ...query, page: undefined }))} rel="nofollow" title={saved('save')} className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-foreground/[0.1] bg-card px-3 text-[13px] font-semibold hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.1]', compact && 'max-sm:size-9 max-sm:justify-center max-sm:px-0')}><BellRing aria-hidden="true" className="size-4 text-primary" /><span className={cn(compact && 'max-sm:sr-only')}>{saved('save')}</span></Link>;

  const list = data.tasks.length === 0
    ? <EmptyState
        title={t(emptyFiltered ? 'filteredEmptyTitle' : 'noTasksTitle')}
        body={t(emptyFiltered ? 'filteredEmptyBody' : hub ? 'hubEmptyBody' : 'noTasksBody')}
        action={emptyFiltered ? { label: t('clearFilters'), href: localeHref(routes.taskBoard(market.slug), locale) } : hub ? { label: t('becomeHelper'), href: localeHref(routes.becomeAHelper(), locale) } : { label: t('postTask'), href: localeHref(routes.app.newTask(), locale) }}
      />
    : query.view === 'cards'
      ? <ul className="grid gap-3 sm:grid-cols-2">{data.tasks.map((task) => <li key={task.id} className="min-w-0"><PublicTaskCard task={task} now={now} headingLevel={2} /></li>)}</ul>
      : data.sections
        ? <div className="space-y-3">{data.sections.map((section) => {
            const name = section.kind === 'remote' ? t('remoteSection') : section.areaName ?? section.key;
            const more = section.count > section.tasks.length;
            return <section key={section.key} aria-labelledby={`board-${section.key}`} className={panelClass}>
              <header className={panelHeadClass}>
                <h2 id={`board-${section.key}`} className="text-[15px] font-semibold">{name}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{t('sectionCount', { count: section.count })}</span></h2>
                {more && <Link href={section.kind === 'remote' ? href({ remoteOnly: true }) : href({ areas: [section.areaSlug ?? section.key] })} rel="nofollow" className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{section.kind === 'remote' ? t('seeAllRemote', { count: section.count }) : t('seeAll', { count: section.count, area: name })}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>}
              </header>
              <Rows tasks={section.tasks} now={now} visitKey={visitKey} showArea={false} />
            </section>;
          })}</div>
        : dayGroups
          ? <div className="space-y-3">{dayGroups.map((group) => <section key={group.day} aria-labelledby={`board-day-${group.day}`} className={panelClass}>
              <header className={panelHeadClass}><h2 id={`board-day-${group.day}`} className="text-[15px] font-semibold">{dayLabel(group.day, group.tasks[0]!)}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{t('sectionCount', { count: group.tasks.length })}</span></h2></header>
              <Rows tasks={group.tasks} now={now} visitKey={visitKey} />
            </section>)}</div>
          : <div className={panelClass}><Rows tasks={data.tasks} now={now} visitKey={visitKey} /></div>;

  // "From your neighbors" (or what Neighbors is, for a visitor), on the first page of the board itself: beside the list on
  // wide screens (2026-11-23), under it on smaller ones.
  const neighborsShown = query.page === 1 && !hub;
  return <div className="space-y-5">
    {/* The same switch as on Neighbors, in the same place (2026-11-23); a service's hub has its own heading. */}
    {!data.heading && <NeighborhoodSwitch current="tasks" neighborsHref={neighborsHrefOf(data)} tasksHref={routes.taskBoard(market.slug)} taskCount={data.stats.openCount} />}
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl space-y-1.5">
        <h1 className={PAGE_TITLE_CLASS}>{data.heading?.title ?? t('title', { market: market.name })}</h1>
        <p className="text-[15px] text-muted-foreground">{data.heading?.intro ?? t('description')}</p>
        <p className="flex flex-wrap gap-x-2 text-sm font-medium tabular-nums">
          <span>{t('stats.open', { count: data.stats.openCount })}</span>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className={data.stats.postedToday > 0 ? 'text-primary' : 'text-muted-foreground'}>{t('stats.postedToday', { count: data.stats.postedToday })}</span>
          <LastVisitNote visitKey={visitKey} now={now} />
        </p>
      </div>
      {/* The board's own posting is the composer under the heading (2026-11-23); a service's hub keeps its two buttons. */}
      {hub && <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={routes.becomeAHelper()} className={buttonVariants()}>{t('becomeHelper')}</Link>
        <Link href={routes.app.newTask({ category: query.category })} className={buttonVariants({ variant: 'outline' })}><Plus aria-hidden="true" className="size-4" />{t('postTask')}</Link>
      </div>}
    </header>

    {/* Post right here, as on Neighbors: a task from a line of words, or a neighborhood ask (2026-11-23). */}
    {!hub && <BoardComposer market={market.name} {...(query.category ? { category: query.category } : {})} />}

    <div className={cn('grid items-start gap-5', nothingYet ? 'xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-6' : 'lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[15rem_minmax(0,1fr)_17.5rem]')}>
      {/* The rail grows with the page: a nested scroll box cut the neighborhoods off with no hint (audit M19). */}
      {!nothingYet && <aside aria-label={t('filters')} className="lg:row-span-2 xl:row-span-1">
        <BoardFilters board={data} />
      </aside>}

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* min-h: the Live status arrives after the page and must not push the list down when it does (audit M18). */}
          <div className="flex min-h-9 items-center gap-3">
            {/* The market's own counts are in the header; a board the person filtered says how many match (a hub's own
                category isn't their filter, so the count shows once, audit M42). */}
            {emptyFiltered && <p className="text-sm font-semibold tabular-nums" role="status">{t('results', { count: data.totalCount })}</p>}
            <BoardLive
              marketSlug={market.slug}
              timeZone={market.timeZone}
              query={{ category: query.category, type: query.type, q: query.q, areas: query.areas, minPrice: query.minPrice, maxPrice: query.maxPrice, pricing: query.pricing, posted: query.posted, times: query.times, few: query.few, when: query.when, remoteOnly: query.remoteOnly }}
              areas={data.facets.areas.map(({ slug, name }) => ({ slug, name }))}
              shownIds={data.tasks.map((task) => task.id)}
              listId="board-list"
            />
          </div>
          {/* With nothing open there's no sorting or layout, and the alert takes their place on this row. */}
          {nothingYet && <div className="ml-auto">{saveSearch(false)}</div>}
          {/* Sort, the view and "Save this search" on one row (2026-11-24: Save had a row of its own); phones drop "Sort:". */}
          {!nothingYet && <div className="ml-auto flex items-center gap-2">
            <SortMenu summary={t.rich('sortSummary', { sort: t(`sortOptions.${query.sort}`), label: (chunks) => <span className="max-sm:sr-only">{chunks}</span> })}>
              <MenuGroup label={t('sort')}>{TASK_BOARD_SORTS.map((sort) => <MenuLink key={sort} href={href({ sort })} selected={query.sort === sort} label={t(`sortOptions.${sort}`)} />)}</MenuGroup>
              {query.view === 'list' && <MenuGroup label={t('group')}>{TASK_BOARD_GROUPS.map((group) => <MenuLink key={group} href={href({ group })} selected={query.group === group} label={t(`groupOptions.${group}`)} />)}</MenuGroup>}
            </SortMenu>
            <Segmented label={t('view')}>{TASK_BOARD_VIEWS.map((view) => <SegmentLink key={view} href={href({ view })} selected={query.view === view} label={t(`viewOptions.${view}`)} icon={view === 'list' ? <List aria-hidden="true" className="size-4" /> : <LayoutGrid aria-hidden="true" className="size-4" />} />)}</Segmented>
            {saveSearch(true)}
          </div>}
        </div>

        {query.category && typeTiles.length > 1 && <TaskTypeTiles category={query.category} items={typeTiles} />}

        {chips.length > 0 && <nav aria-label={t('active')} className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => <Link key={chip.key} href={chip.href} rel="nofollow" aria-label={t('removeFilter', { label: chip.label })} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/30 bg-brand-soft px-3 text-[13px] font-medium transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring">{chip.label}<X aria-hidden="true" className="size-3.5" /></Link>)}
          <Link href={routes.taskBoard(market.slug, { view: query.view, group: query.group, sort: query.sort })} rel="nofollow" className="inline-flex min-h-8 items-center px-2 text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('clearAll')}</Link>
        </nav>}

        <div id="board-list" className="scroll-mt-28">{list}</div>

        {data.pageCount > 1 && <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {query.page > 1 && <Link href={routes.taskBoard(market.slug, { ...query, page: query.page - 1 })} rel="prev" className={buttonVariants({ variant: 'outline' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('previous')}</Link>}
          <p className="text-sm tabular-nums">{t('page', { page: query.page, count: data.pageCount })}</p>
          {query.page < data.pageCount && <Link href={routes.taskBoard(market.slug, { ...query, page: query.page + 1 })} rel="next" className={buttonVariants({ variant: 'outline' })}>{t('next')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        </nav>}
      </div>

      {neighborsShown && <div className={cn('min-w-0', nothingYet ? 'xl:col-start-2 xl:row-start-1' : 'lg:col-start-2 xl:col-start-3 xl:row-start-1')}><BoardNeighbors data={data} now={now} /></div>}
    </div>

    <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
      <div className="flex flex-wrap items-center gap-x-2"><p className="text-sm text-muted-foreground">{t('helperHint')}</p><Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('becomeHelper')}<ArrowRight aria-hidden="true" /></Link></div>
    </div>
  </div>;
}
