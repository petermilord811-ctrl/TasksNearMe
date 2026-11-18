import type { ISODateTime, PortalHandlers, PortalPageData } from '@/contracts';
import { AreaStrip } from '@/ui/components/portal/area-strip';
import { ActiveFilters, ListGroupBar, PortalToolbar, TypeTabs } from '@/ui/components/portal/portal-controls';
import { PortalComposer } from '@/ui/components/portal/portal-composer';
import { PortalEmpty } from '@/ui/components/portal/portal-empty';
import { PortalHeader } from '@/ui/components/portal/portal-header';
import { PortalLive } from '@/ui/components/portal/portal-live';
import { PortalRail, YourStuffStrip } from '@/ui/components/portal/portal-rail';
import { PortalStream } from '@/ui/components/portal/portal-stream';

export interface PortalScreenProps { data: PortalPageData; handlers: PortalHandlers; now: ISODateTime }

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md): the community and the task board as one
 * place. The place and its neighborhoods (the portal's channels) across the top; then the composer, the types,
 * the toolbar and the stream (the Feed's cards or the List's rows, from the same items under one set of filters in
 * one URL); and on wide screens a rail beside it (your stuff, helpers nearby, the week's busiest posts, the
 * rules), whose parts join the stream on smaller ones. New posts and tasks wait in a pill until asked for.
 */
export function PortalScreen({ data, handlers, now }: PortalScreenProps) {
  const { query } = data;
  // This browser's last look at the market's portal marks what's new since (completion plan 7.6).
  const visitKey = `portal:${data.market.slug}`;
  // A new filter set starts a new stream; a refresh (a reaction, the live pill) keeps what was added.
  const streamKey = JSON.stringify({ ...query, page: undefined });
  return <div className="space-y-5">
    <PortalHeader data={data} />
    <AreaStrip data={data} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-x-5">
      <div className="min-w-0 space-y-4">
        <PortalComposer data={data} onPost={handlers.onPost} />
        <YourStuffStrip rail={data.rail} query={query} />
        <div className="space-y-3">
          <TypeTabs data={data} />
          <PortalToolbar data={data} />
          <ActiveFilters data={data} />
        </div>
        <PortalLive data={data} listId="portal-stream" />
        <div id="portal-stream" className="scroll-mt-28 space-y-3">
          {query.view === 'list' && data.items.length > 0 && <ListGroupBar data={data} />}
          {data.items.length === 0
            ? <PortalEmpty data={data} />
            : <PortalStream key={streamKey} data={data} now={now} visitKey={visitKey} handlers={handlers} />}
        </div>
      </div>
      <div className="hidden xl:block">
        <PortalRail data={data} />
      </div>
    </div>
  </div>;
}
