import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { suggestTaskWithAi } from '@/modules/marketing/assistant-actions';
import { getHomePageData } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { organizationNode, websiteNode } from '@/modules/seo/structured-data';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { parseSeason } from '@/shared/seasons';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { HomeScreen, HomeScreenSkeleton } from '@/ui/screens/public';
import { LandingPageMarker } from '@/ui/shells/landing-page-marker';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const [page, t] = await Promise.all([getHomePageData(searchEngineRows()), getTranslations('server.meta.home')]);
  const market = page?.data.market.name ?? '';
  return publicPageMetadata({ path: routes.home(), title: { absolute: t('title', { market }) }, description: t('description', { market }) });
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Home for the default market. The site's name and logo prerender with the shell; the landing itself is drawn for
 * the visitor (src/shared/sample-data.ts: sample people and tasks for signed-in testers only), per request inside
 * Suspense, from cached data. It dresses for the market's season; `?season=winter` (or spring, summer, fall) shows
 * another season's look, for a preview (the canonical address stays `/`). It lives in the public pages' layout, so
 * their shell (the top bar and its state) stays put between it and them (plan 9.5); its mark tells that shell to lay
 * it out as the landing, in the static shell before anything streams.
 */
async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  // The public's data, cached: a missing default market is a real 404, before anything streams.
  if (!(await getHomePageData(searchEngineRows()))) notFound();
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
  const [page, query] = await Promise.all([requestRows().then(getHomePageData), searchParams]);
  if (!page) notFound();
  return (
    // The hero's assistant can write a task with AI for visitors (rate-limited, never stored).
    <LandingHandlersProvider handlers={{ onSuggestWithAi: suggestTaskWithAi }}>
      <HomeScreen data={page.data} now={page.now} season={parseSeason(query.season) ?? undefined} />
    </LandingHandlersProvider>
  );
}

export default withClientMessages('[locale]/(public)/page.tsx', HomePage);
