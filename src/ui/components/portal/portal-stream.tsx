'use client';

import { Fragment, useEffect, useEffectEvent, useRef, useState, useTransition, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityReactInput, ISODateTime, PortalHandlers, PortalItem, PortalPageData, PortalQuery } from '@/contracts';
import { routes } from '@/contracts/routes';
import { PostCard } from '@/ui/components/community/post-card';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { portalHref } from './portal-href';
import { PortalRow } from './portal-row';
import { HelpersRow, TrendingCard } from './portal-rail';
import { TaskFeedCard } from './task-feed-card';

/** Pages that load on their own as the reader nears the end; then "Show more" waits, so the footer is reachable. */
export const AUTO_PAGES = 3;
/** How close to the end (px) the next page starts loading. */
const AHEAD_PX = 600;
/** Where the rail's helpers and the week's busiest posts join the Feed on screens without a rail. */
const HELPERS_AFTER = 3;
const TRENDING_AFTER = 8;

const panelClass = 'overflow-hidden rounded-[1.125rem] border border-border bg-card shadow-card';
const panelHeadClass = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/80 bg-muted/50 px-3 py-2 sm:px-4';

type StreamData = Pick<PortalPageData, 'items' | 'sections' | 'query' | 'pageCount' | 'market' | 'today' | 'rail'>;
type StreamHandlers = Pick<PortalHandlers, 'onReact' | 'onSavePost' | 'onSaveTask' | 'onMore'>;

function FeedItem({ item, now, visitKey, query, onReact, onSavePost, onSaveTask }: { item: PortalItem; now: ISODateTime; visitKey: string; query: PortalQuery; onReact: ActionHandler<CommunityReactInput> } & Pick<StreamHandlers, 'onSavePost' | 'onSaveTask'>) {
  return item.type === 'post'
    ? <PostCard post={item.post} now={now} onReact={onReact} onSavePost={onSavePost} linkBase={query} />
    : <TaskFeedCard view={item.task} now={now} visitKey={visitKey} {...(onSaveTask ? { onSaveTask } : {})} />;
}

/**
 * The portal's stream (completion plan 9.10): the Feed's cards or the List's rows, from the same items. The Feed
 * and the List by day keep going like LinkedIn's (the next pages added underneath, by themselves for the first
 * few, then with "Show more"; nothing on screen moves; an item that shifted between pages shows once; screen
 * readers hear how many were added). The List by neighborhood shows each neighborhood's first few with "See all".
 * Without JavaScript, "Show more" is the next page's link.
 */
export function PortalStream({ data, now, visitKey, handlers }: { data: StreamData; now: ISODateTime; visitKey: string; handlers: StreamHandlers }) {
  const t = useTranslations('portal');
  const { formatDate, dayKey } = useFormat();
  const { query } = data;
  const [more, setMore] = useState<PortalItem[]>([]);
  const [next, setNext] = useState(query.page + 1);
  const [last, setLast] = useState(data.pageCount);
  const [autoLoads, setAutoLoads] = useState(0);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [loading, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const keyOf = (item: PortalItem) => `${item.type}:${item.id}`;
  const shown = new Set(data.items.map(keyOf));
  const items = [...data.items, ...more.filter((item) => !shown.has(keyOf(item)))];
  const paged = !data.sections;
  const hasMore = paged && next <= last;
  const { onMore } = handlers;

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
        const seen = new Set([...shown, ...more.map(keyOf)]);
        const fresh = result.items.filter((item) => !seen.has(keyOf(item)));
        setMore([...more, ...fresh]);
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

  // ---- The Feed: cards, with the rail's helpers and the week's busiest posts joining it on smaller screens.
  if (query.view === 'feed') {
    const inFeed = (index: number): ReactNode => {
      if (query.page !== 1) return null;
      if (index === HELPERS_AFTER - 1 && data.rail.helpers.length > 0) return <li className="xl:hidden"><HelpersRow helpers={data.rail.helpers} /></li>;
      if (index === TRENDING_AFTER - 1 && data.rail.trending.length > 0) return <li className="xl:hidden"><TrendingCard trending={data.rail.trending} /></li>;
      return null;
    };
    return <>
      <ol aria-label={t('view.feed')} className="space-y-3">
        {items.map((item, index) => <Fragment key={keyOf(item)}>
          <li data-item={item.type}><FeedItem item={item} now={now} visitKey={visitKey} query={query} onReact={handlers.onReact} onSavePost={handlers.onSavePost} onSaveTask={handlers.onSaveTask} /></li>
          {inFeed(index)}
        </Fragment>)}
      </ol>
      {footer}
    </>;
  }

  // ---- The List by neighborhood: a panel each, its count, the first few, and "See all".
  if (data.sections) {
    return <div className="space-y-3">
      {data.sections.map((section) => {
        const name = section.kind === 'market' ? t('list.market', { market: data.market.name }) : section.areaName ?? section.key;
        const seeAll = section.count > section.items.length;
        return <section key={section.key} aria-labelledby={`portal-${section.key}`} className={panelClass}>
          <header className={panelHeadClass}>
            <h2 id={`portal-${section.key}`} className="text-[15px] font-semibold">
              {name}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{t('list.count', { count: section.count })}</span>
              {section.kind === 'market' && <span className="block text-xs font-normal text-muted-foreground">{t('list.marketHint')}</span>}
            </h2>
            {seeAll && section.areaSlug && <Link href={portalHref(query, { area: section.areaSlug })} className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {t('list.seeAll', { count: section.count, area: name })}<ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>}
          </header>
          <ol className="divide-y divide-border/70">{section.items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} showArea={section.kind === 'market'} /></li>)}</ol>
        </section>;
      })}
    </div>;
  }

  // ---- The List by day (or in one neighborhood): a panel per day posted, newest first in the order given.
  const yesterday = dayKey(new Date(Date.parse(`${data.today}T12:00:00Z`) - 86_400_000));
  const days = items.reduce<{ day: string; items: PortalItem[] }[]>((groups, item) => {
    const day = dayKey(item.at);
    const group = groups.find((candidate) => candidate.day === day);
    if (group) group.items.push(item);
    else groups.push({ day, items: [item] });
    return groups;
  }, []);
  const dayLabel = (day: string, sample: PortalItem) => (day === data.today ? t('list.today') : day === yesterday ? t('list.yesterday') : formatDate(sample.at));
  const byDay = query.group === 'day' || query.sort === 'new';
  return <>
    {byDay
      ? <div className="space-y-3">{days.map((group) => <section key={group.day} aria-labelledby={`portal-day-${group.day}`} className={panelClass}>
          <header className={panelHeadClass}><h2 id={`portal-day-${group.day}`} className="text-[15px] font-semibold">{dayLabel(group.day, group.items[0]!)}<span className="ml-2 text-[13px] font-normal text-muted-foreground tabular-nums">{t('list.count', { count: group.items.length })}</span></h2></header>
          <ol className="divide-y divide-border/70">{group.items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} /></li>)}</ol>
        </section>)}</div>
      : <div className={panelClass}><ol aria-label={t('view.list')} className="divide-y divide-border/70">{items.map((item) => <li key={keyOf(item)}><PortalRow item={item} now={now} visitKey={visitKey} /></li>)}</ol></div>}
    {footer}
  </>;
}
