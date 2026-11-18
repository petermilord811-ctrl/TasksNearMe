import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CATEGORY_SLUGS, routes, type CategorySlug } from '@/contracts';
import { getCategoryPageData, listCategorySlugs } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { KEEP_OUT_OF_SEARCH, marketPagesIndexable } from '@/modules/seo/indexable';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { loadTaskBoard } from '@/modules/tasks/board';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { TaskBoardScreen } from '@/ui/screens/public/task-board-screen';
import { MarketTime } from '@/ui/lib/market-time';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

/**
 * A category's job hub (docs/seo/PLAN.md S4): the market's board on one category, with its own title, heading and
 * intro, for people searching for that kind of work ("moving help jobs in Austin", "trabajos de mudanza en Austin").
 * The other filters stay URL parameters and canonicalize to the hub; `routes.taskBoard` builds these addresses, and
 * src/proxy.ts redirects the board's older `?category=` ones here.
 */

export async function generateStaticParams() {
  const marketSlugs = await listPublicMarketSlugs();
  const params = (
    await Promise.all(
      marketSlugs.map(async (market) => (await listCategorySlugs(market)).map((category) => ({ market, category }))),
    )
  ).flat();
  return params.length > 0 ? params : [{ market: DEFAULT_MARKET_SLUG, category: CATEGORY_SLUGS[0] }];
}

/** The hub's title (its heading too) and intro, in the page's language. */
async function hubCopy(slug: CategorySlug, market: string) {
  const t = await getTranslations('server.seo.taskHub');
  const lead = t(`lead.${slug}`, { market });
  return { title: t(`title.${slug}`, { market }), intro: `${lead} ${t('how')}`, description: `${lead} ${t('pays')}` };
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]/tasks/[category]'>): Promise<Metadata> {
  const { market, category } = await params;
  const page = await getCategoryPageData(market, category, searchEngineRows());
  if (!page) return {};
  const { market: view, category: shown } = page.data;
  const copy = await hubCopy(shown.slug, view.name);
  return {
    ...(await publicPageMetadata({ path: routes.taskBoard(view.slug, { category: shown.slug }), title: copy.title, description: copy.description })),
    ...(marketPagesIndexable(view, DEFAULT_MARKET_SLUG) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/**
 * The city and category are checked outside Suspense, as on the market page, so an unknown or closed city, or a
 * category it doesn't offer, gets a real 404 (inside Suspense, the 200 has already streamed). Filters live in the URL,
 * so the list renders per request inside Suspense; the data is cached per query and per visitor's rows
 * (src/shared/sample-data.ts: sample tasks for signed-in testers only).
 */
async function TaskHubPage({ params, searchParams }: PageProps<'/[locale]/[market]/tasks/[category]'>) {
  const { market, category } = await params;
  // Only a category the market offers has a hub (configuration: the same for every visitor).
  if (!(await getCategoryPageData(market, category, searchEngineRows()))) notFound();
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Hub params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Hub({ params, searchParams }: Pick<PageProps<'/[locale]/[market]/tasks/[category]'>, 'params' | 'searchParams'>) {
  const [{ market, category }, search, rows] = await Promise.all([params, searchParams, requestRows()]);
  const page = await getCategoryPageData(market, category, searchEngineRows());
  if (!page) notFound();
  const { market: view, category: shown } = page.data;
  const [copy, context, boardTitle] = await Promise.all([
    hubCopy(shown.slug, view.name),
    structuredDataContext(),
    getTranslations('server.meta.taskBoard').then((t) => t('title', { market: view.name })),
  ]);
  // The path names the category; a `type` is read for it (the parser keeps a type only with its category).
  const query = parseTaskBoardQuery({ ...search, category: shown.slug });
  const board = await loadTaskBoard(view.slug, query, { category: shown.slug, heading: { title: copy.title, intro: copy.intro }, rows });
  if (!board) notFound();
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: view.name, path: routes.market(view.slug) },
            { name: boardTitle, path: routes.taskBoard(view.slug) },
            { name: copy.title, path: routes.taskBoard(view.slug, { category: shown.slug }) },
          ]),
        ]}
      />
      <MarketTime timeZone={board.data.market.timeZone}><TaskBoardScreen data={board.data} now={board.now} /></MarketTime>
    </>
  );
}

export default withClientMessages('[locale]/(public)/[market]/tasks/[category]/page.tsx', TaskHubPage);
