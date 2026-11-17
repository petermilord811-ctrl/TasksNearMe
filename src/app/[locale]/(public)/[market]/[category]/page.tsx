import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CATEGORY_SLUGS, type CategorySeoContent } from '@/contracts';
import { getCategoryPageData, listCategorySlugs } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { categorySeoContent } from '@/modules/seo/category-content';
import { KEEP_OUT_OF_SEARCH, marketPagesIndexable } from '@/modules/seo/indexable';
import { breadcrumbNode, categoryServiceNode, SITE_NAME } from '@/modules/seo/structured-data';
import { requestRows } from '@/platform/auth/audience';
import { searchEngineRows } from '@/shared/sample-data';
import { PageSkeleton } from '@/ui/components/feedback/page-skeleton';
import { CategoryScreen } from '@/ui/screens/public/category-screen';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

/** Every enabled category in every public market (there's no [market] layout to pass the market down). */
export async function generateStaticParams() {
  const marketSlugs = await listPublicMarketSlugs();
  const params = (
    await Promise.all(
      marketSlugs.map(async (market) => (await listCategorySlugs(market)).map((category) => ({ market, category }))),
    )
  ).flat();
  return params.length > 0 ? params : [{ market: DEFAULT_MARKET_SLUG, category: CATEGORY_SLUGS[0] }];
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]/[category]'>): Promise<Metadata> {
  const { market, category } = await params;
  const [page, t, categoryName] = await Promise.all([getCategoryPageData(market, category, searchEngineRows()), getTranslations('server.meta.category'), categoryNames()]);
  if (!page) return {};
  // The category's name in the page's language: the database's is English.
  const values = { category: categoryName(page.data.category.slug), market: page.data.market.name };
  return {
    ...(await publicPageMetadata({ path: routes.category(page.data.category.slug, market), title: t('title', values), description: t('description', values) })),
    ...(marketPagesIndexable(page.data.market, DEFAULT_MARKET_SLUG) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/**
 * Unknown markets and categories are a real 404 (outside Suspense). The structured data and the search content
 * (counts of real rows only, questions, the city guide, links) are the same for everyone; the screen's tasks and
 * helpers are drawn for the visitor inside Suspense (src/shared/sample-data.ts).
 */
async function CategoryPage({ params }: PageProps<'/[locale]/[market]/[category]'>) {
  const { market, category } = await params;
  const page = await getCategoryPageData(market, category, searchEngineRows());
  if (!page) notFound();
  const [context, t, categoryName] = await Promise.all([structuredDataContext(), getTranslations('server.meta.category'), categoryNames()]);
  // Counts, questions people ask, the city guide and related links (docs/seo/PLAN.md S3).
  const seo = await categorySeoContent(page.data, context.locale, categoryName);
  const { market: view, category: shown } = page.data;
  const values = { category: categoryName(shown.slug), market: view.name };
  const path = routes.category(shown.slug, view.slug);
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: view.name, path: routes.market(view.slug) },
            { name: values.category, path },
          ]),
          categoryServiceNode(context, {
            market: view,
            serviceType: values.category,
            name: t('title', values),
            description: t('description', values),
            path,
            priceGuidance: shown.priceGuidance,
          }),
        ]}
      />
      <Suspense fallback={<PageSkeleton variant="detail" />}>
        <Category market={view.slug} category={shown.slug} seo={seo} />
      </Suspense>
    </>
  );
}

async function Category({ market, category, seo }: { market: string; category: string; seo: CategorySeoContent }) {
  const page = await getCategoryPageData(market, category, await requestRows());
  if (!page) notFound();
  return <CategoryScreen data={{ ...page.data, seo }} now={page.now} />;
}

export default withClientMessages('[locale]/(public)/[market]/[category]/page.tsx', CategoryPage);
