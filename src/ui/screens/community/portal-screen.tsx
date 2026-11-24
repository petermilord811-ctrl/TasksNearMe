import type { ISODateTime, PortalHandlers, PortalPageData } from '@/contracts';
import { NEIGHBORS_RAIL_ADS } from '@/contracts/ads';
import { PORTAL_GENERAL } from '@/contracts/portal';
import { SponsoredAd } from '@/ui/components/ads/sponsored-ad';
import { AreaStrip } from '@/ui/components/portal/area-strip';
import { NeighborhoodSwitch } from '@/ui/components/portal/neighborhood-switch';
import { ActiveFilters, ListGroupBar, PortalToolbar, SaveTasksSearch, TypeTabs } from '@/ui/components/portal/portal-controls';
import { PortalComposer } from '@/ui/components/portal/portal-composer';
import { PortalEmpty } from '@/ui/components/portal/portal-empty';
import { PortalHeader } from '@/ui/components/portal/portal-header';
import { neighborsHref, openTasksHref } from '@/ui/components/portal/portal-href';
import { PortalLive } from '@/ui/components/portal/portal-live';
import { AnnouncementCard, AskAreaCard, SamplesNote } from '@/ui/components/portal/portal-notes';
import { NeighborsWelcomeCard } from '@/ui/components/portal/neighbors-welcome';
import { PortalPhoneBar } from '@/ui/components/portal/portal-phone-bar';
import { PortalRail, YourStuffStrip } from '@/ui/components/portal/portal-rail';
import { PortalStream } from '@/ui/components/portal/portal-stream';
import { BoardComposer } from '@/ui/components/tasks/board-composer';

export interface PortalScreenProps { data: PortalPageData; handlers: PortalHandlers; now: ISODateTime }

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md; plan 10, docs/ui/neighbors-10.md): the
 * community and the task board as one place, in two tabs (owner, 2026-11-23): Neighbors, and Open tasks (`type=task`),
 * the board inside the app (its rows by neighborhood or day, its sorts and filters), with the Neighbors | Open tasks
 * switch at the top of both (on phones, across the sticky bar). On wide screens the place and its neighborhoods (the
 * portal's channels) across the top; on phones one row that stays under the app's bar (the place, the sort, Filters),
 * so posts start high. Then the composer (on Open tasks, the board's: words become a task), staff's pinned card, "which
 * neighborhood are you in?" while we don't know, the kinds of posts, the toolbar and the stream (the Feed's cards or the
 * List's rows, from the same items under one set of filters in one URL); and on wide screens a rail beside it (your
 * stuff, on Neighbors the place's newest open tasks, helpers nearby, the asks waiting for an answer, the week's busiest
 * posts, the rules), whose parts join the stream on smaller ones. New posts and tasks wait in a pill until asked for.
 * The rail also carries two sponsored cards (2026-11-22): one above its cards, one pinned under them while the stream
 * scrolls; the route imports their styles (ads.css).
 */
export function PortalScreen({ data, handlers, now }: PortalScreenProps) {
  const { query } = data;
  const tasks = query.type === 'task';
  // This browser's last look at the market's portal marks what's new since (completion plan 7.6).
  const visitKey = `portal:${data.market.slug}`;
  // A new filter set starts a new stream; a refresh (a reaction, the live pill) keeps what was added.
  const streamKey = JSON.stringify({ ...query, page: undefined });
  const [topAd, pinnedAd] = NEIGHBORS_RAIL_ADS;
  return <div className="space-y-3 sm:space-y-4">
    <PortalPhoneBar data={data} {...(handlers.onSetArea ? { onSetArea: handlers.onSetArea } : {})} />
    <div className="max-sm:hidden">
      <NeighborhoodSwitch current={tasks ? 'tasks' : 'neighbors'} neighborsHref={neighborsHref(query)} tasksHref={openTasksHref(query)} taskCount={data.stats.openTasks} />
    </div>
    <div className="max-sm:hidden"><PortalHeader data={data} /></div>
    <div className="max-sm:hidden"><AreaStrip data={data} {...(handlers.onSetArea ? { onSetArea: handlers.onSetArea } : {})} /></div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-x-5 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:gap-x-6">
      <div className="min-w-0 space-y-3">
        {!tasks && data.welcome && <NeighborsWelcomeCard key={data.welcome.id} welcome={data.welcome} {...(handlers.onDismissWelcome ? { onDismiss: handlers.onDismissWelcome } : {})} />}
        {tasks
          ? <BoardComposer market={data.market.name} {...(query.category && query.category !== PORTAL_GENERAL ? { category: query.category } : {})} />
          : <PortalComposer data={data} handlers={handlers} />}
        {data.announcement && <AnnouncementCard announcement={data.announcement} {...(handlers.onDismissAnnouncement ? { onDismiss: handlers.onDismissAnnouncement } : {})} />}
        {data.askArea && handlers.onSetArea && <AskAreaCard areas={data.areas} marketName={data.market.name} onSetArea={handlers.onSetArea} />}
        <YourStuffStrip rail={data.rail} query={query} />
        <div className="space-y-2">
          {/* The kinds of posts are Neighbors' own; Open tasks is one kind already. */}
          {!tasks && <TypeTabs data={data} />}
          <div className="max-sm:hidden"><PortalToolbar data={data} /></div>
          {tasks
            ? <div className="flex flex-wrap items-start justify-between gap-2"><ActiveFilters data={data} /><div className="ml-auto"><SaveTasksSearch boardHref={data.boardHref} /></div></div>
            : <ActiveFilters data={data} />}
        </div>
        {data.samples && <SamplesNote shown={data.samples.shown} {...(handlers.onShowSamples ? { onShowSamples: handlers.onShowSamples } : {})} />}
        <PortalLive data={data} listId="portal-stream" {...(handlers.onCheckFresh ? { onCheckFresh: handlers.onCheckFresh } : {})} />
        <div id="portal-stream" className="scroll-mt-28 space-y-2.5">
          {/* One neighborhood (or what's citywide) lists by day only, so there's no grouping to choose (sweep P9). */}
          {query.view === 'list' && data.items.length > 0 && data.place.kind !== 'area' && data.place.kind !== 'citywide' && <ListGroupBar data={data} />}
          {data.items.length === 0
            ? <PortalEmpty data={data} />
            : <PortalStream key={streamKey} data={data} now={now} visitKey={visitKey} handlers={handlers} />}
        </div>
      </div>
      {/* As tall as the stream, so the last ad can stay in view while it scrolls. */}
      <div className="hidden xl:flex xl:flex-col xl:gap-4 xl:self-stretch">
        <SponsoredAd ad={topAd} />
        <PortalRail data={data} />
        <div className="sticky top-[calc(var(--app-header-offset,4.25rem)+1.5rem)]"><SponsoredAd ad={pinnedAd} /></div>
      </div>
    </div>
  </div>;
}
