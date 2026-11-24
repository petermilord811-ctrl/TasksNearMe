'use client';

import { Fragment, useEffect, useEffectEvent, useRef, useState, useTransition, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, PortalHandlers, PortalItem, PortalPageData, PortalQuery } from '@/contracts';
import { PORTAL_CITYWIDE } from '@/contracts/portal';
import { routes } from '@/contracts/routes';
import { highlightWords } from '@/ui/components/community/highlight';
import { PostCard } from '@/ui/components/community/post-card';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { portalHref } from './portal-href';
import { PortalRow } from './portal-row';
import { HelpersRow, OpenTasksStrip, TrendingCard, UnansweredCard } from './portal-rail';
import { TaskFeedCard } from './task-feed-card';
import { keyOfItem, refreshedStream, rereadStream } from './stream-merge';

/** Pages that load on their own as the reader nears the end; then "Show more" waits, so the footer is reachable. */
export const AUTO_PAGES = 3;
/** How close to the end (px) the next page starts loading. */
const AHEAD_PX = 600;
/**
 * Where the rail's cards join the Feed on screens without a rail: "Open tasks near you" after the first three items
 * (2026-11-23), then the helpers, the asks waiting for an answer and the week's busiest posts.
 */
const OPEN_TASKS_AFTER = 3;
const HELPERS_AFTER = 6;
const UNANSWERED_AFTER = 9;
const TRENDING_AFTER = 12;

const panelClass = 'overflow-hidden rounded-[1.125rem] border border-border bg-card shadow-card';
const panelHeadClass = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/80 bg-muted/50 px-3 py-2 sm:px-4';

type StreamData = Pick<PortalPageData, 'items' | 'sections' | 'query' | 'pageCount' | 'market' | 'today' | 'rail' | 'place'> & Partial<Pick<PortalPageData, 'me' | 'helps' | 'openTasks'>>;
type StreamHandlers = Pick<PortalHandlers, 'onReact' | 'onSavePost' | 'onSaveTask' | 'onMore' | 'onReply' | 'onLoadReactors' | 'onFollow' | 'onEdit' | 'onDelete'>;

function FeedItem({ item, now, visitKey, query, me, handlers }: { item: PortalItem; now: ISODateTime; visitKey: string; query: PortalQuery; me?: PortalPageData['me']; handlers: StreamHandlers }) {
  return item.type === 'post'
    ? <PostCard
        post={item.post}
        now={now}
        onReact={handlers.onReact}
        onSavePost={handlers.onSavePost}
        linkBase={query}
        {...(handlers.onReply ? { onReplyInline: handlers.onReply } : {})}
        {...(me ? { me } : {})}
        {...(handlers.onLoadReactors ? { onLoadReactors: handlers.onLoadReactors } : {})}
        {...(handlers.onFollow ? { onFollow: handlers.onFollow } : {})}
        {...(handlers.onEdit ? { onEdit: handlers.onEdit } : {})}
        {...(handlers.onDelete ? { onDelete: handlers.onDelete } : {})}
      />
    // Open tasks' cards (2026-11-23) are the board's: whole, with their first words. Tasks are that tab's only
    // (2026-11-24); Neighbors shows its newest in "Open tasks near you".
    : <TaskFeedCard view={item.task} now={now} visitKey={visitKey} highlight={highlightWords(query.q)} {...(handlers.onSaveTask ? { onSaveTask: handlers.onSaveTask } : {})} />;
}

/**
 * The portal's stream (completion plan 9.10): the Feed's cards or the List's rows, from the same items. The Feed
 * and the List by day keep going like LinkedIn's (the next pages added underneath, by themselves for the first
 * few, then with "Show more"; nothing on screen moves, a refresh included; an item that shifted between pages shows
 * once; screen readers hear how many were added). The List by neighborhood shows each neighborhood's first few with "See all".
 * Without JavaScript, "Show more" is the next page's link. `groups` (the viewer's building and street groups, 2026-11-24)
 * joins on screens without the rail, on the first page: after the Feed's first item, or the List's first panel.
 */
export function PortalStream({ data, now, visitKey, handlers, groups }: { data: StreamData; now: ISODateTime; visitKey: string; handlers: StreamHandlers; groups?: ReactNode }) {
  const t = useTranslations('portal');
  const { formatDate, dayKey } = useFormat();
  const { query } = data;
  const groupsHere = Boolean(groups) && query.page === 1;
  const groupsPanel = groupsHere && <div className="xl:hidden">{groups}</div>;
  // What's on screen: the first page, then the pages loaded under it, in the order they came.
  const [items, setItems] = useState<PortalItem[]>(data.items);
  const [firstPage, setFirstPage] = useState(data.items);
  const [reread, setReread] = useState(0);
  const [next, setNext] = useState(query.page + 1);
  const [last, setLast] = useState(data.pageCount);
  const [autoLoads, setAutoLoads] = useState(0);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [loading, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const rereads = useRef(0);
  const keyOf = keyOfItem;
  const paged = !data.sections;
  const hasMore = paged && next <= last;
  const { onMore } = handlers;
  // The first page was read again (same filters: new ones start a new stream): merge it in place, and read the later
  // pages again when some are on screen.
  if (firstPage !== data.items) {
    const laterLoaded = next > query.page + 1;
    setItems(refreshedStream(items, firstPage, data.items, laterLoaded));
    setFirstPage(data.items);
    if (laterLoaded) setReread((count) => count + 1);
  }
  const rereadLater = useEffectEvent(async () => {
    if (!onMore) return;
    const round = ++rereads.current;
    const later: PortalItem[] = [];
    let pageCount = last;
    for (let page = query.page + 1; page < next; page += 1) {
      let result: Awaited<ReturnType<NonNullable<typeof onMore>>> = null;
      try {
        result = await onMore({ ...query, page });
      } catch {
        result = null;
      }
      // A failed read changes nothing on screen.
      if (!result || round !== rereads.current) return;
      later.push(...result.items);
      pageCount = result.pageCount;
    }
    setItems((current) => rereadStream(current, data.items, later));
    setLast(pageCount);
  });
  useEffect(() => {
    if (reread === 0) return;
    const timer = window.setTimeout(() => void rereadLater(), 0);
    return () => window.clearTimeout(timer);
  }, [reread]);

  const load = (auto: boolean) => {
    if (!onMore || loading || !hasMore) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<NonNullable<typeof onMore>>> = null;
      try {
        result = await onMore({ ...query, page: next });
      } catch {
        result = null;
      }
      startTransition(() => {
        if (!result) {
          setFailed(true);
          return;
        }
        const page = result;
        const seen = new Set(items.map(keyOf));
        const fresh = page.items.filter((item) => !seen.has(keyOf(item)));
        // Merged into what's on screen now: a refresh may have changed it while the page was on its way.
        setItems((current) => {
          const shown = new Set(current.map(keyOf));
          return [...current, ...page.items.filter((item) => !shown.has(keyOf(item)))];
        });
        setNext(result.page + 1);
        setLast(result.pageCount);
        setFailed(false);
        if (auto) setAutoLoads((count) => count + 1);
        setAnnouncement(t('more.loaded', { count: fresh.length }));
      });
    });
  };
  const onEndVisible = useEffectEvent(() => {
    if (autoLoads < AUTO_PAGES && !failed) load(true);
  });
  useEffect(() => {
    const node = end.current;
    if (!node || !onMore || !paged || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onEndVisible();
    }, { rootMargin: `${AHEAD_PX}px 0px` });
    observer.observe(node);
    return () => observer.disconnect();
  }, [next, onMore, paged]);

  const footer = paged && <>
    <p aria-live="polite" className="sr-only">{announcement}</p>
    <div ref={end} className="flex flex-col items-center gap-2 pt-1">
      {hasMore
        ? <Link
            href={routes.app.community({ ...query, page: next })}
            prefetch={false}
            aria-disabled={loading || undefined}
            onClick={(event) => {
              if (!onMore) return;
              event.preventDefault();
              load(false);
            }}
            className={buttonVariants({ variant: 'outline' })}
          >
            {loading && <Spinner aria-hidden="true" />}{loading ? t('more.loading') : t('more.show')}
          </Link>
        : items.length > 0 && <p className="text-sm text-muted-foreground">{t('more.end')}</p>}
      {failed && <p role="alert" className="text-sm text-destructive">{t('more.failed')}</p>}
    </div>
  </>;

  // ---- The Feed: cards (runs of tasks folded, plan 10.8), with the rail's helpers, the asks waiting for an answer and
  //      the week's busiest posts joining it on smaller screens.
  if (query.view === 'feed') {
    // The Neighbors tab's look at the other one, in Everything only (2026-11-23): after the third item, or after the last
    // when the Feed is shorter (a quiet place on its first days).
    const everything = !query.type && !query.saved && !query.unanswered;
    const openTasksAt = Math.min(OPEN_TASKS_AFTER, items.length) - 1;
    const inFeed = (index: number): ReactNode => {
      if (query.page !== 1) return null;
      if (index === openTasksAt && everything && data.openTasks && data.openTasks.items.length > 0) return <li className="xl:hidden"><OpenTasksStrip data={{ openTasks: data.openTasks, query, place: data.place, market: data.market }} /></li>;
      if (index === HELPERS_AFTER - 1 && data.rail.helpers.length > 0) return <li className="xl:hidden"><HelpersRow helpers={data.rail.helpers} /></li>;
      if (index === UNANSWERED_AFTER - 1 && data.rail.unanswered.length > 0 && !query.unanswered) return <li className="xl:hidden"><UnansweredCard unanswered={data.rail.unanswered} query={query} /></li>;
      if (index === TRENDING_AFTER - 1 && data.rail.trending.length > 0) return <li className="xl:hidden"><TrendingCard trending={data.rail.trending} /></li>;
      return null;
    };
    return <>
      <ol aria-label={t('view.feed')} className="space-y-3">
        {items.map((item, index) => <Fragment key={keyOf(item)}>
          <li data-item={item.type}><FeedItem item={item} now={now} visitKey={visitKey} query={query} {...(data.me ? { me: data.me } : {})} handlers={handlers} /></li>
          {index === 0 && groupsHere && <li className="xl:hidden">{groups}</li>}
          {inFeed(index)}
        </Fragment>)}
      </ol>
      {footer}
    </>;
  }

  // On Open tasks (2026-11-23) the groups count tasks, and what belongs to no neighborhood is remote work.
  const tasksTab = query.type === 'task';
  const countOf = (count: number) => (tasksTab ? t('list.tasks', { count }) : t('list.count', { count }));

  // ---- The List by neighborhood: a panel each, its count, the first few, and "See all".
  if (data.sections) {
    return <div className="space-y-3">
      {data.sections.map((section, index) => {
        const name = section.kind === 'market' ? (tasksTab ? t('list.remote') : t('list.market', { market: data.market.name })) : section.areaName ?? section.key;
        const seeAll = section.count > section.items.length;
        // "See all" picks the neighborhood, or for "Across {market}" what belongs to none (sweep P10).
        const seeAllHref = section.kind === 'market' ? portalHref(query, { area: PORTAL_CITYWIDE }) : section.areaSlug ? portalHref(query, { area: section.areaSlug }) : undefined;
        return <Fragment key={section.key}><section aria-labelledby={`portal-${section.key}`} className={panelClass}>
          <header className={panelHeadClass}>
            <h2 id={`portal-${section.key}`} className="text-[15px] font-semibold">
              {name}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{countOf(section.count)}</span>
              {section.kind === 'market' && !tasksTab && <span className="block text-xs font-normal text-muted-foreground">{t('list.marketHint')}</span>}
            </h2>
            {seeAll && seeAllHref && <Link href={seeAllHref} className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {section.kind === 'market' ? (tasksTab ? t('list.seeAllRemote', { count: section.count }) : t('list.seeAllCitywide', { count: section.count })) : t('list.seeAll', { count: section.count, area: name })}<ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>}
          </header>
          <ol className="divide-y divide-border/70">{section.items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} showArea={section.kind === 'market'} highlight={highlightWords(query.q)} /></li>)}</ol>
        </section>{index === 0 && groupsPanel}</Fragment>;
      })}
    </div>;
  }

  // ---- The List by day (or in one neighborhood): a panel per day posted, the newest day first, each day's rows in
  //      the order given (the sort). On Open tasks (2026-11-23), as the board: the day each task is on, the soonest first.
  const yesterday = dayKey(new Date(Date.parse(`${data.today}T12:00:00Z`) - 86_400_000));
  const tomorrow = dayKey(new Date(Date.parse(`${data.today}T12:00:00Z`) + 86_400_000));
  const dayOf = (item: PortalItem) => (tasksTab && item.type === 'task' ? item.task.task.schedule.windowStart : item.at);
  const days = items
    .reduce<{ day: string; items: PortalItem[] }[]>((groups, item) => {
      const day = dayKey(dayOf(item));
      const group = groups.find((candidate) => candidate.day === day);
      if (group) group.items.push(item);
      else groups.push({ day, items: [item] });
      return groups;
    }, [])
    .sort((a, b) => (tasksTab ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day)));
  const dayLabel = (day: string, sample: PortalItem) => (day === data.today ? t('list.today') : tasksTab && day === tomorrow ? t('list.tomorrow') : !tasksTab && day === yesterday ? t('list.yesterday') : formatDate(dayOf(sample)));
  // One neighborhood, or what's citywide, is always by day (design §3: grouping by neighborhood means nothing there; sweep
  // P9); Neighbors' newest are too. Open tasks by the newest post stay one list (their days are the tasks').
  const byDay = data.place.kind === 'area' || data.place.kind === 'citywide' || query.group === 'day' || (!tasksTab && query.sort === 'new');
  return <>
    {byDay
      ? <div className="space-y-3">{days.map((group, index) => <Fragment key={group.day}><section aria-labelledby={`portal-day-${group.day}`} className={panelClass}>
          <header className={panelHeadClass}><h2 id={`portal-day-${group.day}`} className="text-[15px] font-semibold">{dayLabel(group.day, group.items[0]!)}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{countOf(group.items.length)}</span></h2></header>
          <ol className="divide-y divide-border/70">{group.items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} highlight={highlightWords(query.q)} /></li>)}</ol>
        </section>{index === 0 && groupsPanel}</Fragment>)}</div>
      : <div className="space-y-3"><div className={panelClass}><ol aria-label={t('view.list')} className="divide-y divide-border/70">{items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} highlight={highlightWords(query.q)} /></li>)}</ol></div>{groupsPanel}</div>}
    {footer}
  </>;
}
