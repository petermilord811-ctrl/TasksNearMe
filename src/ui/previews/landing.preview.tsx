import type { CategorySlug, HomePageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts';
import { homeEmptyMapData, homeNoListingsData, homeNoRewardData, homePageData, previewSuggestTaskWithAi, publicViewer } from '@/fixtures';
import type { LatLng } from '@/shared/geo';
import type { Season } from '@/shared/seasons';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
import { HomeScreen, HomeScreenSkeleton } from '@/ui/screens/public';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/landing.json';

const now = '2026-11-17T15:00:00.000Z';
/**
 * Gainesville before its first helper and task, as the public will first see it there: the town grows north
 * Florida's plants (live oaks hung with moss, tall pines, cabbage palms, saw palmetto). Its neighborhoods are the
 * seed's (db/seeds/data/gainesville.ts).
 */
const gainesville: HomePageData = {
  ...homeNoListingsData,
  market: {
    ...homeNoListingsData.market,
    slug: 'gainesville',
    name: 'Gainesville',
    state: 'FL',
    timeZone: 'America/New_York',
    areaNames: ['Downtown', 'Duckpond', 'Pleasant Street', 'University Heights', 'Midtown', 'Golfview', 'Thornebrook', 'Millhopper'],
  },
};
/** A visitor in Mueller (inside the service area) and one in Dallas (outside it). */
const inMueller: LatLng = { lat: 30.2989, lng: -97.7064 };
const inDallas: LatLng = { lat: 32.7767, lng: -96.797 };

function landing(id: string, title: string, data: HomePageData, theme: 'light' | 'dark' = 'light', season?: Season): PreviewEntry {
  return {
    id,
    group: copy.previews.group,
    title,
    layout: 'fullscreen',
    render: () => (
      <div data-theme={theme} className="bg-background text-foreground">
        <PublicShell viewer={publicViewer} currentPath={routes.home()} variant="landing">
          <LandingHandlersProvider handlers={{ onSuggestWithAi: previewSuggestTaskWithAi }}>
            <HomeScreen data={data} now={now} mapMode="static" season={season} />
          </LandingHandlersProvider>
        </PublicShell>
      </div>
    ),
  };
}

function map(id: string, title: string, options: { location?: LatLng; category?: CategorySlug } = {}): PreviewEntry {
  return {
    id,
    group: copy.previews.group,
    title,
    layout: 'fullscreen',
    render: () => (
      <div data-theme="light" className="bg-background text-foreground">
        <LandingProvider initialLocation={options.location} initialCategory={options.category}>
          <MapSection data={homePageData} mapMode="static" />
        </LandingProvider>
      </div>
    ),
  };
}

export const landingPreviews: PreviewEntry[] = [
  landing('screen-home/default', copy.previews.default, homePageData),
  landing('screen-home/no-reward', copy.previews.noReward, homeNoRewardData),
  landing('screen-home/empty-map', copy.previews.emptyMap, homeEmptyMapData),
  // What the public sees before the first real helper and task (sample rows are for signed-in testers only).
  landing('screen-home/no-listings', copy.previews.noListings, homeNoListingsData),
  {
    id: 'screen-home/loading',
    group: copy.previews.group,
    title: copy.previews.loading,
    layout: 'fullscreen',
    render: () => (
      <div data-theme="light" className="bg-background text-foreground">
        <PublicShell viewer={publicViewer} currentPath={routes.home()} variant="landing">
          <HomeScreenSkeleton />
        </PublicShell>
      </div>
    ),
  },
  landing('screen-home/dark', copy.previews.dark, homePageData, 'dark'),
  // The other seasons' looks (`now` is in late fall: the default and dark previews show fall).
  landing('screen-home/winter', copy.previews.winter, homePageData, 'light', 'winter'),
  landing('screen-home/winter-dark', copy.previews.winterDark, homePageData, 'dark', 'winter'),
  landing('screen-home/spring', copy.previews.spring, homePageData, 'light', 'spring'),
  landing('screen-home/summer', copy.previews.summer, homePageData, 'light', 'summer'),
  landing('screen-home/summer-dark', copy.previews.summerDark, homePageData, 'dark', 'summer'),
  landing('screen-home/gainesville', copy.previews.gainesville, gainesville),
  landing('screen-home/gainesville-spring', copy.previews.gainesvilleSpring, gainesville, 'light', 'spring'),
  map('component-landing-map/default', copy.previews.map),
  map('component-landing-map/near-you', copy.previews.mapNearYou, { location: inMueller }),
  map('component-landing-map/outside-area', copy.previews.mapOutside, { location: inDallas }),
  map('component-landing-map/category', copy.previews.mapCategory, { category: 'yard-cleanup' }),
];
