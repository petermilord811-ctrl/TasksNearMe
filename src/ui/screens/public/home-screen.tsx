import type { CategorySlug, HomePageData, ISODateTime, MapHome } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { seasonAt, type Season } from '@/shared/seasons';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { ChapterStage } from '@/ui/landing/chapters/chapter-stage';
import { Hero } from '@/ui/landing/hero';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
import { SeasonProvider } from '@/ui/landing/season';
import type { MapMode } from '@/ui/landing/map/task-map';
import { CategoriesSection, ClosingSection, CoverageSection, FaqSection, HelpersSection, PricingSection, StepsSection, TrustSection } from '@/ui/landing/sections';
import { MotionRoot } from '@/ui/motion';

export interface HomeScreenProps {
  data: HomePageData;
  now: ISODateTime;
  /** Previews and tests draw the map without tiles or WebGL. */
  mapMode?: MapMode;
  /** Previews: a visitor who already shared a location, or picked a category. */
  initialLocation?: LatLng;
  initialCategory?: CategorySlug;
  /** The season to dress for: a `?season=` link (to see another season's look) and previews. Otherwise the
   * market's own, on its calendar at `now`. */
  season?: Season;
  /** A signed-in helper's home neighborhood: the map starts from it instead of asking the browser where they are. */
  home?: MapHome;
  /** The page is drawn for the city the visitor picked on the map before: their location doesn't move the map away. */
  cityPicked?: boolean;
}

/**
 * The landing page (UI-036): one shared state so the hero canvas, the floating cards, the categories, the
 * map and its list respond to each other; scroll reveals switched on by `MotionRoot`.
 *
 * It dresses for the season (`data-season`, landing.css "Seasons"): late fall now, snow from December, blossoms
 * in spring, full green in summer. The hero's town, sky and weather, the map's parks and water, and the closing
 * card follow it, and the task assistant's examples are the season's. The brand, the words and the data don't
 * change.
 */
export function HomeScreen({ data, now, mapMode = 'interactive', initialLocation, initialCategory, season: chosen, home, cityPicked = false }: HomeScreenProps) {
  const season = chosen ?? seasonAt(now, data.market.timeZone);
  return (
    <SeasonProvider season={season}>
      <LandingProvider initialCity={{ market: data.market, map: data.map }} cityPicked={cityPicked} initialLocation={initialLocation} initialCategory={initialCategory} home={home}>
        <MotionRoot />
        {/* One paper under the whole page (a faint marble), so no section starts or stops a background. */}
        <div className="paper" data-season={season}>
          {/* The town, the live map and the categories share one pinned stage, and a scroll gesture moves between them
              (ChapterStage); with reduced motion, in previews and tests they're plain sections, one after another. */}
          <ChapterStage enabled={mapMode === 'interactive'}>
            <Hero data={data} mode={mapMode} now={now} season={season} />
            <MapSection data={data} mapMode={mapMode} />
            <CategoriesSection data={data} />
          </ChapterStage>
          <StepsSection />
          <PricingSection data={data} />
          <TrustSection />
          <HelpersSection data={data} />
          <CoverageSection data={data} />
          <FaqSection />
          <ClosingSection data={data} season={season} />
        </div>
      </LandingProvider>
    </SeasonProvider>
  );
}

/**
 * The landing while it streams in. The page reads who's visiting before it draws (signed-in testers also see the demo
 * marketplace), so the prerendered shell holds this: a hero-tall placeholder on the page's paper, so the footer never
 * shows first.
 */
export function HomeScreenSkeleton() {
  return (
    <div className="paper min-h-svh">
      <div className="mx-auto w-full max-w-[78rem] px-gutter pt-32 sm:pt-36 lg:pt-[clamp(6.5rem,15svh,10rem)]">
        <PageSkeleton variant="cards" />
      </div>
    </div>
  );
}
