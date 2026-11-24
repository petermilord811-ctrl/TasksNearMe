import type { ReactNode } from 'react';
import { ArrowRight, BadgeCheck, Bookmark, ClipboardList, Clock, Flame, Laptop, Lock, MapPin, MessageCircleQuestion, MessagesSquare, Plus, Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PortalHelper, PortalPageData, PortalRail as PortalRailData, PortalTaskView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { ScrollRow } from '@/ui/components/layout/scroll-row';
import { openTasksHref, savedHref, unansweredHref } from './portal-href';
import { categoryIcons, useTaskPrice } from './task-feed-card';

const cardClass = 'min-w-0 rounded-2xl border border-border bg-card p-3.5 shadow-card';
const cardTitle = 'flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase';
const rowLink = 'group/row flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

/** A helper's rating and how many neighbors recommend them. */
function HelperFacts({ helper }: { helper: PortalHelper }) {
  const t = useTranslations('portal.rail');
  return <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
    {helper.rating && <span className="inline-flex items-center gap-0.5 font-medium text-foreground tabular-nums"><Star aria-hidden="true" className="size-3 fill-current text-sun" />{helper.rating.average.toFixed(1)}<span className="font-normal text-muted-foreground">({helper.rating.count})</span></span>}
    <span className="tabular-nums">{t('recommendedBy', { count: helper.recommendedBy })}</span>
  </p>;
}

const requestClass = 'inline-flex min-h-8 shrink-0 items-center justify-center rounded-full border border-primary/35 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring';

/**
 * One helper who works in the place: their photo, name and checks, rating and neighbors' word, and Request. In the
 * rail the name and Request share the first line and the rest uses the card's whole width; in the Feed, a tile.
 */
export function HelperItem({ helper, layout }: { helper: PortalHelper; layout: 'rail' | 'tile' }) {
  const t = useTranslations('portal.rail');
  const card = useTranslations('helperCard');
  const name = <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
    <Link href={routes.helperProfile(helper.handle)} className="truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{helper.displayName}</Link>
    {helper.verified && <BadgeCheck aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}
  </p>;
  const request = (className?: string) => <Link href={helper.requestHref} aria-label={t('requestLabel', { name: helper.displayName })} className={cn(requestClass, className)}>{t('request')}</Link>;
  if (layout === 'rail') {
    return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5">
      <span className="row-span-2 self-start"><InitialsAvatar initials={helper.initials} photo={helper.photo} size="sm" /></span>
      {name}
      {request()}
      <div className="col-span-2 col-start-2 space-y-0.5 leading-tight">
        <HelperFacts helper={helper} />
        {helper.headline && <p className="line-clamp-1 text-xs text-muted-foreground">{helper.headline}</p>}
      </div>
    </div>;
  }
  return <div className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card">
    <div className="flex min-w-0 items-start gap-3">
      <InitialsAvatar initials={helper.initials} photo={helper.photo} size="md" />
      <div className="min-w-0 space-y-0.5 leading-tight">
        {name}
        <HelperFacts helper={helper} />
        {helper.headline && <p className="line-clamp-2 text-xs text-muted-foreground">{helper.headline}</p>}
        {helper.responseTime && <p className="text-xs text-muted-foreground">{card('responseTime', { range: helper.responseTime })}</p>}
      </div>
    </div>
    {request('mt-auto w-full')}
  </div>;
}

/** The week's liveliest posts in the place, numbered. */
export function TrendingCard({ trending }: { trending: PortalRailData['trending'] }) {
  const t = useTranslations('portal.rail');
  return <section aria-labelledby="portal-trending" className={cardClass}>
    <h2 id="portal-trending" className={cardTitle}><Flame aria-hidden="true" className="size-4 text-primary" />{t('trending')}</h2>
    {trending.length === 0
      ? <p className="mt-2 text-sm text-muted-foreground">{t('trendingNone')}</p>
      : <ol className="mt-2 space-y-0.5">
          {trending.map((post, index) => <li key={post.id}>
            <Link href={routes.app.communityPost(post.id)} className="group/row -mx-2 flex min-w-0 gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <span aria-hidden="true" className="w-4 shrink-0 font-display text-base font-semibold text-primary tabular-nums">{index + 1}</span>
              <span className="min-w-0 leading-snug">
                <span className="line-clamp-2 text-sm font-medium group-hover/row:text-primary">{post.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{t('trendingMeta', { replies: post.replyCount, helpful: post.helpful })}{post.areaName && <> · {post.areaName}</>}</span>
              </span>
            </Link>
          </li>)}
        </ol>}
  </section>;
}

/**
 * "Waiting for an answer" (plan 10.17): the place's asks of the week nobody answered yet, the oldest first (a helper's
 * own services first), each a link to answer it, and the Unanswered filter.
 */
export function UnansweredCard({ unanswered, query }: { unanswered: PortalRailData['unanswered']; query: PortalPageData['query'] }) {
  const t = useTranslations('portal.rail');
  const card = useTranslations('taskCard');
  if (unanswered.length === 0) return null;
  return <section aria-labelledby="portal-unanswered" className={cardClass}>
    <h2 id="portal-unanswered" className={cardTitle}><MessageCircleQuestion aria-hidden="true" className="size-4 text-primary" />{t('unanswered')}</h2>
    <ul className="mt-2 space-y-0.5">{unanswered.map((post) => <li key={post.id}>
      <Link href={routes.app.communityPost(post.id)} className="group/row -mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="line-clamp-2 text-sm font-medium group-hover/row:text-primary">{post.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{post.categorySlug ? card(`categories.${post.categorySlug}`) : t('unansweredGeneral')}{post.areaName && <> · {post.areaName}</>}</span>
      </Link>
    </li>)}</ul>
    <Link href={unansweredHref(query)} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('unansweredAll')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
  </section>;
}

type OpenTasksData = Pick<PortalPageData, 'query' | 'place' | 'market'> & { openTasks: NonNullable<PortalPageData['openTasks']> };

/** "Open tasks near you", or in the neighborhood, the city, or remote, as the place is. */
function useOpenTasksTitle(data: Pick<PortalPageData, 'place' | 'market'>): string {
  const t = useTranslations('portal.openTasks');
  const { place } = data;
  if (place.kind === 'nearby') return t('nearby');
  if (place.kind === 'area') return t('area', { area: place.name });
  if (place.kind === 'citywide') return t('remote');
  return t('market', { market: data.market.name });
}

/** When an open task is: its day, and its hours or "any time that day". */
function useTaskWhen(view: PortalTaskView): string {
  const t = useTranslations('portal');
  const { formatDate, formatTimeRange } = useFormat();
  const { schedule } = view.task;
  return `${formatDate(schedule.windowStart)} · ${schedule.flexible ? t('task.anyTime') : formatTimeRange(schedule.windowStart, schedule.windowEnd)}`;
}

/** One open task in the rail's card: its title (where it opens for this viewer), the price, the place and when. */
function OpenTaskLine({ view }: { view: PortalTaskView }) {
  const t = useTranslations('portal');
  const { task } = view;
  const { price } = useTaskPrice(task);
  const when = useTaskWhen(view);
  return <Link href={view.href} className="group/row -mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
    <span className="flex items-start justify-between gap-3">
      <span className="line-clamp-2 min-w-0 text-sm font-medium group-hover/row:text-primary">{task.title}</span>
      <span className="shrink-0 font-display text-sm font-semibold tabular-nums">{price}</span>
    </span>
    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.location.kind === 'remote' ? t('task.remote') : task.location.areaName} · {when}</span>
  </Link>;
}

/**
 * "Open tasks near you" (2026-11-23) in the rail on wide screens: the place's newest open tasks, each opening where it
 * should for the viewer, and the Open tasks tab with all of them. With none, a quiet line and the way to post one.
 */
export function OpenTasksCard({ data }: { data: OpenTasksData }) {
  const t = useTranslations('portal.openTasks');
  const title = useOpenTasksTitle(data);
  const { items, count } = data.openTasks;
  return <section aria-labelledby="portal-open-tasks" className={cardClass}>
    <h2 id="portal-open-tasks" className={cardTitle}><ClipboardList aria-hidden="true" className="size-4 text-primary" />{title}</h2>
    {items.length === 0
      ? <div className="mt-2 space-y-1.5">
          <p className="text-sm text-muted-foreground">{t('none')}</p>
          <Link href={routes.app.newTask()} className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Plus aria-hidden="true" className="size-3.5" />{t('post')}</Link>
        </div>
      : <ul className="mt-1.5 space-y-0.5">{items.map((view) => <li key={view.task.id}><OpenTaskLine view={view} /></li>)}</ul>}
    {count > 0 && <Link href={openTasksHref(data.query)} className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('seeAll', { count })}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>}
  </section>;
}

/** One open task as a tile in the Feed's strip: the service, the title, the price, the place and when. */
function OpenTaskTile({ view }: { view: PortalTaskView }) {
  const t = useTranslations('portal');
  const card = useTranslations('taskCard');
  const { task } = view;
  const Icon = categoryIcons[task.categorySlug];
  const { price, note } = useTaskPrice(task);
  const when = useTaskWhen(view);
  return <article className="relative flex h-full min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-colors focus-within:border-primary/40 hover:border-primary/40">
    <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1"><Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate">{task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : card(`categories.${task.categorySlug}`)}</span></span>
    </p>
    {/* The whole tile opens the task: the title's link stretches over it. */}
    <h3 className="line-clamp-2 text-[15px]/5 font-semibold"><Link href={view.href} className="rounded-sm outline-offset-2 after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-2 focus-visible:outline-ring">{task.title}</Link></h3>
    <p className="mt-auto font-display text-base font-semibold tabular-nums">{price}{note && <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">{note}</span>}</p>
    <p className="space-y-0.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1 truncate">{task.location.kind === 'remote' ? <><Laptop aria-hidden="true" className="size-3.5 shrink-0" />{t('task.remote')}</> : <><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{task.location.areaName}</>}</span>
      <span className="flex items-center gap-1 truncate tabular-nums"><Clock aria-hidden="true" className="size-3.5 shrink-0" />{when}</span>
    </p>
  </article>;
}

/**
 * "Open tasks near you" (2026-11-23) inside the Feed on phones and tablets (no rail there): the place's newest open
 * tasks as tiles that swipe sideways, and the Open tasks tab with all of them.
 */
export function OpenTasksStrip({ data }: { data: OpenTasksData }) {
  const t = useTranslations('portal.openTasks');
  const title = useOpenTasksTitle(data);
  const { items, count } = data.openTasks;
  return <section aria-labelledby="portal-open-tasks-strip" className="space-y-2.5">
    <div className="flex items-baseline justify-between gap-3">
      <h2 id="portal-open-tasks-strip" className="font-display text-base font-semibold">{title}</h2>
      <Link href={openTasksHref(data.query)} className="inline-flex min-h-9 shrink-0 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('seeAll', { count })}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
    </div>
    <ScrollRow label={title} className="snap-x snap-mandatory gap-3 pb-1">
      {items.map((view) => <li key={view.task.id} className="w-[15rem] shrink-0 snap-start"><OpenTaskTile view={view} /></li>)}
    </ScrollRow>
  </section>;
}

/** Helpers nearby, as a sideways row inside the Feed (screens without the rail). */
export function HelpersRow({ helpers }: { helpers: PortalHelper[] }) {
  const t = useTranslations('portal');
  return <section aria-labelledby="portal-helpers-row" className="space-y-2.5">
    <div className="flex items-baseline justify-between gap-3">
      <h2 id="portal-helpers-row" className="font-display text-base font-semibold">{t('inFeed.helpers')}</h2>
      <Link href={routes.app.helpers()} className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline">{t('rail.helpersAll')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
    </div>
    <ScrollRow className="snap-x snap-mandatory gap-3 pb-1">
      {helpers.map((helper) => <li key={helper.handle} className="w-[15.5rem] snap-start"><HelperItem helper={helper} layout="tile" /></li>)}
    </ScrollRow>
  </section>;
}

/** What needs the viewer, under the composer on screens without the rail: their open tasks with offers (two at most), saved. */
export function YourStuffStrip({ rail, query }: { rail: PortalRailData; query: PortalPageData['query'] }) {
  const t = useTranslations('portal');
  const waiting = rail.yourTasks.filter((task) => task.offerCount > 0).sort((a, b) => b.offerCount - a.offerCount).slice(0, 2);
  if (waiting.length === 0 && rail.savedCount === 0) return null;
  // Phones: the busiest task and Saved share one line (the task's title gives way); from `sm`, two tasks.
  return <nav aria-label={t('inFeed.yourStuff')} className="xl:hidden">
    <ul className="flex gap-2 sm:flex-wrap">
      {waiting.map((task, index) => <li key={task.id} className={cn('min-w-0', index > 0 && 'max-sm:hidden')}>
        <Link href={task.href} className="inline-flex min-h-8 max-w-[min(18rem,100%)] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
          <ClipboardList aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate font-medium">{task.title}</span>
          <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold text-primary-foreground tabular-nums">{t('rail.offers', { count: task.offerCount })}</span>
        </Link>
      </li>)}
      {rail.savedCount > 0 && <li className="shrink-0"><Link href={savedHref(query)} aria-current={query.saved ? 'true' : undefined} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:border-primary/50 aria-[current=true]:bg-brand-soft">
        <Bookmark aria-hidden="true" className="size-4 text-primary" />{t('saved.count', { count: rail.savedCount })}
      </Link></li>}
    </ul>
  </nav>;
}

/**
 * The rail beside the stream on wide screens (completion plan 9.10): your open tasks, your posts and what you
 * saved; on Neighbors, the place's newest open tasks (2026-11-23); helpers who work in the place; the week's liveliest
 * posts; and the rules that keep it a good place. `groups`, the viewer's building and street groups (2026-11-24), comes
 * first.
 */
export function PortalRail({ data, groups }: { data: Pick<PortalPageData, 'rail' | 'query' | 'place' | 'market'> & Partial<Pick<PortalPageData, 'openTasks'>>; groups?: ReactNode }) {
  const t = useTranslations('portal.rail');
  const { rail, query } = data;
  const nothing = rail.yourTasks.length === 0 && rail.yourPosts.length === 0 && rail.savedCount === 0;
  const helpersHref = routes.app.helpers(data.place.kind === 'area' ? { area: data.place.slug } : {});
  return <aside aria-label={t('label')} className="space-y-3">
    {groups}

    <section aria-labelledby="portal-your-stuff" className={cardClass}>
      <h2 id="portal-your-stuff" className={cardTitle}><ClipboardList aria-hidden="true" className="size-4 text-primary" />{t('yourStuff')}</h2>
      {nothing
        ? <p className="mt-2 text-sm text-muted-foreground">{t('nothingYet')}</p>
        : <div className="mt-2 space-y-3">
            {rail.yourTasks.length > 0 && <div>
              <h3 className="text-xs font-semibold text-muted-foreground">{t('yourTasks')}</h3>
              <ul className="mt-1">{rail.yourTasks.map((task) => <li key={task.id}><Link href={task.href} className={rowLink}>
                <span className="truncate text-sm font-medium group-hover/row:text-primary">{task.title}</span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', task.offerCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{t('offers', { count: task.offerCount })}</span>
              </Link></li>)}</ul>
            </div>}
            {rail.yourPosts.length > 0 && <div>
              <h3 className="text-xs font-semibold text-muted-foreground">{t('yourPosts')}</h3>
              <ul className="mt-1">{rail.yourPosts.map((post) => <li key={post.id}><Link href={routes.app.communityPost(post.id)} className={rowLink}>
                <span className="truncate text-sm font-medium group-hover/row:text-primary">{post.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"><MessagesSquare aria-hidden="true" className="size-3.5" />{post.replyCount}</span>
              </Link></li>)}</ul>
            </div>}
            {rail.savedCount > 0 && <Link href={savedHref(query)} aria-current={query.saved ? 'true' : undefined} className={cn(rowLink, 'aria-[current=true]:bg-brand-soft')}>
              <span className="inline-flex items-center gap-2 text-sm font-medium"><Bookmark aria-hidden="true" className="size-4 text-primary" />{t('savedItems', { count: rail.savedCount })}</span>
              <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </Link>}
          </div>}
    </section>

    {/* The Neighbors tab's look at the other one (2026-11-23); Open tasks is that list itself. */}
    {data.openTasks && <OpenTasksCard data={{ ...data, openTasks: data.openTasks }} />}

    <section aria-labelledby="portal-helpers" className={cardClass}>
      <h2 id="portal-helpers" className={cardTitle}><Users aria-hidden="true" className="size-4 text-primary" />{t('helpers')}</h2>
      {rail.helpers.length === 0
        ? <p className="mt-2 text-sm text-muted-foreground">{t('helpersNone')}</p>
        : <ul className="mt-2.5 space-y-3">{rail.helpers.map((helper) => <li key={helper.handle}><HelperItem helper={helper} layout="rail" /></li>)}</ul>}
      <Link href={helpersHref} className="mt-2 inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('helpersAll')}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
    </section>

    <UnansweredCard unanswered={rail.unanswered} query={query} />

    <TrendingCard trending={rail.trending} />

    <section aria-labelledby="portal-good-to-know" className={cn(cardClass, 'space-y-1.5 text-[13px] text-muted-foreground')}>
      <h2 id="portal-good-to-know" className={cardTitle}>{t('goodToKnow')}</h2>
      <p>{t('guidelines')}</p>
      <p className="flex items-start gap-2"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
    </section>
  </aside>;
}
