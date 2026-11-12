import type { CategorySlug, HomePageData, ISODateTime } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { Hero } from '@/ui/landing/hero';
import { LandingProvider } from '@/ui/landing/landing-state';
import { MapSection } from '@/ui/landing/map-section';
import type { MapMode } from '@/ui/landing/map/task-map';
import { CategoriesSection, ClosingSection, CoverageStrip, FaqSection, HelpersSection, PricingSection, StepsSection, TrustSection } from '@/ui/landing/sections';
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
export function HomeScreen({ data, mapMode = 'interactive', initialLocation, initialCategory }: HomeScreenProps) {
  return (
    <LandingProvider initialLocation={initialLocation} initialCategory={initialCategory}>
      <MotionRoot />
      <Hero data={data} />
      <MapSection data={data} mapMode={mapMode} />
      <CategoriesSection data={data} />
      <StepsSection />
      <PricingSection data={data} />
      <TrustSection />
      <HelpersSection data={data} />
      <CoverageStrip data={data} />
      <FaqSection />
      <ClosingSection data={data} />
    </LandingProvider>
  );
}
