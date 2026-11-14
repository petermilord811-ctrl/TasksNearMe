import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CATEGORY_SLUGS } from '@/contracts';
import { getCategoryPageData, listCategorySlugs } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { CategoryScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
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
  const [page, t] = await Promise.all([getCategoryPageData(market, category), getTranslations('server.meta.category')]);
  if (!page) return {};
  const values = { category: page.data.category.name, market: page.data.market.name };
  return { title: t('title', values), description: t('description', values), alternates: await languageAlternates(routes.category(page.data.category.slug, market)) };
}

async function CategoryPage({ params }: PageProps<'/[locale]/[market]/[category]'>) {
  const { market, category } = await params;
  const page = await getCategoryPageData(market, category);
  if (!page) notFound();
  return <CategoryScreen data={page.data} now={page.now} />;
}

export default withClientMessages('[locale]/(public)/[market]/[category]/page.tsx', CategoryPage);
