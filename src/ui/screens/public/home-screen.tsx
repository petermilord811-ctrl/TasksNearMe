import type { CategorySlug, HomePageData, ISODateTime } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { Hero } from '@/ui/landing/hero';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
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
}

/**
 * The landing page (UI-036): one shared state so the hero canvas, the floating cards, the categories, the
 * map and its list respond to each other; scroll reveals switched on by `MotionRoot`.
 */
export function HomeScreen({ data, now, mapMode = 'interactive', initialLocation, initialCategory }: HomeScreenProps) {
  return (
    <LandingProvider initialLocation={initialLocation} initialCategory={initialCategory}>
      <MotionRoot />
      {/* One paper under the whole page (a faint marble), so no section starts or stops a background. */}
      <div className="paper">
        {/* On wide screens the hero stays pinned while the map slides up over it like a sheet. */}
        <div className="relative">
          <Hero data={data} mode={mapMode} now={now} />
          <MapSection data={data} mapMode={mapMode} />
        </div>
        <CategoriesSection data={data} />
        <StepsSection />
        <PricingSection data={data} />
        <TrustSection />
        <HelpersSection data={data} />
        <CoverageSection data={data} />
        <FaqSection />
        <ClosingSection data={data} />
      </div>
    </LandingProvider>
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
