// The landing's own styles: its route imports them (src/app/[locale]/(public)/page.tsx), so its previews do too.
import '@/ui/landing/landing.css';
import type { CategorySlug, HomePageData, PreviewEntry, WaitlistInput } from '@/contracts';
import { routes } from '@/contracts';
import { citylessHomeData, fakeHandler, homeEmptyMapData, homeNoListingsData, homeNoRewardData, homePageData, previewSuggestTaskWithAi, publicViewer } from '@/fixtures';
import type { LatLng } from '@/shared/geo';
import type { Season } from '@/shared/seasons';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
import { MapCardRail } from '@/ui/landing/map/card-rail';
import { MapExplorerProvider } from '@/ui/landing/map/explorer-state';
import { CitylessHomeScreen, HomeScreen, HomeScreenSkeleton } from '@/ui/screens/public';
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

/** The full-screen map's row of task cards (9.7), on its own: the live map isn't drawn in previews. */
function rail(id: string, title: string, theme: 'light' | 'dark' = 'light'): PreviewEntry {
  return {
    id,
    group: copy.previews.group,
    title,
    layout: 'fullscreen',
    render: () => (
      <div data-theme={theme} className="bg-background text-foreground">
        <LandingProvider>
          <MapExplorerProvider>
            <div className="paper relative h-[34rem]">
              <MapCardRail map={homePageData.map} className="absolute inset-x-0 bottom-0" />
            </div>
          </MapExplorerProvider>
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
  rail('component-landing-map/card-row', copy.previews.mapRail),
  // The home page while its city isn't open (launch rehearsal J-L1): no counts or map, the cities, the waitlist.
  ...(['light', 'dark'] as const).map((theme) => ({
    id: theme === 'light' ? 'screen-home/no-city' : 'screen-home/no-city-dark',
    group: copy.previews.group,
    title: theme === 'light' ? copy.previews.noCity : copy.previews.noCityDark,
    layout: 'fullscreen' as const,
    render: () => (
      <div data-theme={theme} className="bg-background text-foreground">
        <PublicShell viewer={publicViewer} currentPath={routes.home()} variant="landing">
          <CitylessHomeScreen data={citylessHomeData} handlers={{ onJoin: fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }) }} />
        </PublicShell>
      </div>
    ),
  })),
  rail('component-landing-map/card-row-dark', copy.previews.mapRailDark, 'dark'),
];
