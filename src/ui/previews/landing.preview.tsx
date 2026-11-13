import type { CategorySlug, HomePageData, PreviewEntry } from '@/contracts';
import { routes } from '@/contracts';
import { homeEmptyMapData, homeNoRewardData, homePageData, previewSuggestTaskWithAi, publicViewer } from '@/fixtures';
import type { LatLng } from '@/shared/geo';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
import { HomeScreen } from '@/ui/screens/public';
import { PublicShell } from '@/ui/shells/public-shell';
import copy from '../../../messages/en/ui/landing.json';

const now = '2026-11-17T15:00:00.000Z';
/** A visitor in Mueller (inside the service area) and one in Dallas (outside it). */
const inMueller: LatLng = { lat: 30.2989, lng: -97.7064 };
const inDallas: LatLng = { lat: 32.7767, lng: -96.797 };

function landing(id: string, title: string, data: HomePageData, theme: 'light' | 'dark' = 'light'): PreviewEntry {
  return {
    id,
    group: copy.previews.group,
    title,
    layout: 'fullscreen',
    render: () => (
      <div data-theme={theme} className="bg-background text-foreground">
        <PublicShell viewer={publicViewer} currentPath={routes.home()} variant="landing">
          <LandingHandlersProvider handlers={{ onSuggestWithAi: previewSuggestTaskWithAi }}>
            <HomeScreen data={data} now={now} mapMode="static" />
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
  landing('screen-home/dark', copy.previews.dark, homePageData, 'dark'),
  map('component-landing-map/default', copy.previews.map),
  map('component-landing-map/near-you', copy.previews.mapNearYou, { location: inMueller }),
  map('component-landing-map/outside-area', copy.previews.mapOutside, { location: inDallas }),
  map('component-landing-map/category', copy.previews.mapCategory, { category: 'yard-cleanup' }),
];
