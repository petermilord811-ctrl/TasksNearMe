import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getMarketPageData, getTaskBoardPageData } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { KEEP_OUT_OF_SEARCH, marketPagesIndexable } from '@/modules/seo/indexable';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { TaskBoardScreen } from '@/ui/screens/public/task-board-screen';
import { MarketTime } from '@/ui/lib/market-time';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

export async function generateStaticParams() {
  const slugs = await listPublicMarketSlugs();
  return (slugs.length > 0 ? slugs : [DEFAULT_MARKET_SLUG]).map((market) => ({ market }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]/tasks'>): Promise<Metadata> {
  const { market } = await params;
  const [page, t] = await Promise.all([getMarketPageData(market, searchEngineRows()), getTranslations('server.meta.taskBoard')]);
  if (!page) return {};
  const values = { market: page.data.market.name };
  // Filtered and paged URLs all point search engines at the plain board.
  return {
    ...(await publicPageMetadata({ path: routes.taskBoard(market), title: t('title', values), description: t('description', values) })),
    ...(marketPagesIndexable(page.data.market, DEFAULT_MARKET_SLUG) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/**
 * The city is checked outside Suspense, as on the market page, so an unknown or closed one gets a real 404 (inside
 * Suspense, the 200 has already streamed). Filters live in the URL, so the list renders per request inside Suspense;
 * the data is cached per query and per visitor's rows (src/shared/sample-data.ts: sample tasks for signed-in testers
 * only).
 */
async function TaskBoardPage({ params, searchParams }: PageProps<'/[locale]/[market]/tasks'>) {
  const { market } = await params;
  if (!(await getMarketPageData(market, searchEngineRows()))) notFound();
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Board params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({ params, searchParams }: Pick<PageProps<'/[locale]/[market]/tasks'>, 'params' | 'searchParams'>) {
  const [{ market }, search, rows] = await Promise.all([params, searchParams, requestRows()]);
  const page = await getTaskBoardPageData(market, parseTaskBoardQuery(search), rows);
  if (!page) notFound();
  const [context, t] = await Promise.all([structuredDataContext(), getTranslations('server.meta.taskBoard')]);
  const view = page.data.market;
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: view.name, path: routes.market(view.slug) },
            { name: t('title', { market: view.name }), path: routes.taskBoard(view.slug) },
          ]),
        ]}
      />
      <MarketTime timeZone={page.data.market.timeZone}><TaskBoardScreen data={page.data} now={page.now} /></MarketTime>
    </>
  );
}

export default withClientMessages('[locale]/(public)/[market]/tasks/page.tsx', TaskBoardPage);
