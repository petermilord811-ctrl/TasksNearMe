import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CATEGORY_SLUGS } from '@/contracts';
import { getCategoryPageData, listCategorySlugs } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { PageSkeleton } from '@/ui/components';
import { CategoryScreen } from '@/ui/screens/public';

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

export async function generateMetadata({ params }: PageProps<'/[market]/[category]'>): Promise<Metadata> {
  const { market, category } = await params;
  const [page, t] = await Promise.all([getCategoryPageData(market, category), getTranslations('server.meta.category')]);
  if (!page) return {};
  const values = { category: page.data.category.name, market: page.data.market.name };
  return { title: t('title', values), description: t('description', values) };
}

export default function CategoryPage({ params }: PageProps<'/[market]/[category]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Category params={params} />
    </Suspense>
  );
}

async function Category({ params }: Pick<PageProps<'/[market]/[category]'>, 'params'>) {
  const { market, category } = await params;
  const page = await getCategoryPageData(market, category);
  if (!page) notFound();
  return <CategoryScreen data={page.data} now={page.now} />;
}
