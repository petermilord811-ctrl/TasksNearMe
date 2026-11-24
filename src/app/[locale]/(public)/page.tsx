// The landing's own styles (not the app's): only this route loads them.
import '@/ui/landing/landing.css';
import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { localeOrDefault, routes } from '@/contracts';
import { joinWaitlistAction } from '@/modules/marketing/actions';
import { suggestTaskWithAi } from '@/modules/marketing/assistant-actions';
import { loadLandingCity } from '@/modules/marketing/landing-city-actions';
import { getCitylessHomeData, getHomePageData, ownCitySlug } from '@/modules/marketing/queries';
import { HOME_MARKET_COOKIE, homeMarketOverridable, homeMarketOverride, LANDING_CITY_COOKIE, landingCityCandidates } from '@/modules/markets/default-market';
import { findHomeArea } from '@/modules/verification/home-area';
import { JsonLd } from '@/modules/seo/json-ld';
import { organizationNode, websiteNode } from '@/modules/seo/structured-data';
import { requestRows } from '@/platform/auth/audience';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { searchEngineRows } from '@/shared/sample-data';
import { chosenSeason, SEASON_COOKIE } from '@/shared/seasons';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { CitylessHomeScreen, HomeScreen, HomeScreenSkeleton } from '@/ui/screens/public';
import { LandingPageMarker } from '@/ui/shells/landing-page-marker';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const [page, t] = await Promise.all([getHomePageData(searchEngineRows()), getTranslations('server.meta.home')]);
  const market = page?.data.market.name;
  // Without its city (paused, or none open) it's still the site's home, indexable, and about no one city.
  return publicPageMetadata({ path: routes.home(), title: { absolute: t('title', { market: market ?? '' }) }, description: market ? t('description', { market }) : t('descriptionNoCity') });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home for the visitor's city: the one they picked on the map before, a signed-in person's own, else the default market
 * (and, while none of those is public, the home without a city: CitylessHomeScreen). The
 * site's name and logo prerender with the shell; the landing itself is drawn for
 * the visitor (src/shared/sample-data.ts: sample people and tasks for signed-in testers only), per request inside
 * Suspense, from cached data. It dresses for the market's season; `?season=winter` (or spring, summer, fall, autumn)
 * shows another season's look, for a preview (the canonical address stays `/`), and keeps it for the rest of the
 * browser session (src/proxy.ts; `?season=auto` goes back). It lives in the public pages' layout, so
 * their shell (the top bar and its state) stays put between it and them (plan 9.5); its mark tells that shell to lay
 * it out as the landing, in the static shell before anything streams.
 */
async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const [context, site] = await Promise.all([structuredDataContext(), getTranslations('server.meta.site')]);
  return (
    <>
      <LandingPageMarker />
      {/* The site's name and logo for search results. */}
      <JsonLd nodes={[organizationNode(context, site('description')), websiteNode(context, site('description'))]} />
      <Suspense fallback={<HomeScreenSkeleton />}>
        <Landing searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Landing({ searchParams }: { searchParams: SearchParams }) {
  const [rows, query, home, cities, store] = await Promise.all([requestRows(), searchParams, viewerHome(), requestCities(), cookies()]);
  const picked = store.get(LANDING_CITY_COOKIE)?.value;
  // The first city that's open or opening (and visible to this visitor) is the one the page is drawn for.
  let page: Awaited<ReturnType<typeof getHomePageData>> = null;
  for (const slug of cities) {
    page = await getHomePageData(rows, slug);
    if (page) break;
  }
  if (!page) {
    // The home city isn't public (paused, or none open yet; launch rehearsal J-L1): the site's home without a city (200),
    // with every city's status and the waitlist, never a 404.
    const [cityless, locale] = await Promise.all([getCitylessHomeData(rows), getLocale()]);
    return <CitylessHomeScreen data={cityless} handlers={{ onJoin: joinWaitlistAction.bind(null, localeOrDefault(locale)) }} />;
  }
  return (
    // The hero's assistant can write a task with AI for visitors (rate-limited, never stored); the map can switch to
    // another city's tasks in place (its slug only: the visitor's location stays on their device).
    <LandingHandlersProvider handlers={{ onSuggestWithAi: suggestTaskWithAi, onLoadCity: loadLandingCity }}>
      <HomeScreen
        data={page.data}
        now={page.now}
        season={chosenSeason(query.season, store.get(SEASON_COOKIE)?.value) ?? undefined}
        home={home ?? undefined}
        // Drawn for the city the visitor picked before: their location doesn't move the map away from it.
        cityPicked={picked !== undefined && picked === page.data.market.slug}
      />
    </LandingHandlersProvider>
  );
}

/**
 * The cities the home page may be drawn for, best first (owner, 2026-11-23: "This platform is not for only
 * Gainesville"): the one the visitor picked on the map before (its cookie), a signed-in person's own city, then the
 * default. A test's cookie replaces them all (development and the e2e build only, and only for a request made on this
 * machine: the dev server's public address can't switch it), so a spec can show the home without a city.
 */
async function requestCities(): Promise<string[]> {
  const [store, requestHeaders, viewer] = await Promise.all([cookies(), headers(), getViewer()]);
  const override = homeMarketOverride(store.get(HOME_MARKET_COOKIE)?.value, homeMarketOverridable(process.env, (name) => requestHeaders.get(name)));
  if (override) return [override];
  const own = viewer.kind === 'user' ? await ownCitySlug(viewer.user.id) : null;
  return landingCityCandidates(store.get(LANDING_CITY_COOKIE)?.value, own);
}

/**
 * A signed-in helper's home neighborhood (its center, never the address): the map starts there instead of asking the
 * browser. Per request and only for them (it's read inside this page's Suspense boundary, never cached).
 */
async function viewerHome() {
  const viewer = await getViewer();
  return viewer.kind === 'user' ? findHomeArea(db, viewer.user.id) : null;
}

export default withClientMessages('[locale]/(public)/page.tsx', HomePage);
