import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMarketPageData } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { KEEP_OUT_OF_SEARCH, marketPagesIndexable } from '@/modules/seo/indexable';
import { breadcrumbNode, marketServiceNode, SITE_NAME } from '@/modules/seo/structured-data';
import { MarketScreen } from '@/ui/screens/public/market-screen';
import { categoryNames, publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { routes } from '@/contracts';

export async function generateStaticParams() {
  const slugs = await listPublicMarketSlugs();
  return (slugs.length > 0 ? slugs : [DEFAULT_MARKET_SLUG]).map((market) => ({ market }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[market]'>): Promise<Metadata> {
  const { market } = await params;
  const [page, t] = await Promise.all([getMarketPageData(market), getTranslations('server.meta.market')]);
  if (!page) return {};
  return {
    ...(await publicPageMetadata({
      path: routes.market(market),
      title: t('title', { market: page.data.market.name }),
      description: t('description', { market: page.data.market.name }),
    })),
    // A city that isn't open yet stays out of search until it is (src/modules/seo/indexable.ts).
    ...(marketPagesIndexable(page.data.market, DEFAULT_MARKET_SLUG) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

/** Params are awaited outside Suspense, so every market URL gets its own cached render and unknown ones a real 404. */
async function MarketPage({ params }: PageProps<'/[locale]/[market]'>) {
  const { market } = await params;
  const page = await getMarketPageData(market);
  if (!page) notFound();
  const [context, t, categoryName] = await Promise.all([structuredDataContext(), getTranslations('server.meta.market'), categoryNames()]);
  const { market: view, categories } = page.data;
  const path = routes.market(view.slug);
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: view.name, path },
          ]),
          marketServiceNode(context, {
            market: view,
            name: t('title', { market: view.name }),
            description: t('description', { market: view.name }),
            path,
            categories: categories.map((category) => ({ name: categoryName(category.slug), path: routes.category(category.slug, view.slug) })),
          }),
        ]}
      />
      <MarketScreen data={page.data} now={page.now} />
    </>
  );
}

export default withClientMessages('[locale]/(public)/[market]/page.tsx', MarketPage);
