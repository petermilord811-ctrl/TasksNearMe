import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMarketPageData } from '@/modules/marketing/queries';
import { DEFAULT_MARKET_SLUG, listPublicMarketSlugs } from '@/modules/markets/queries';
import { MarketScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';
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
    title: t('title', { market: page.data.market.name }),
    description: t('description', { market: page.data.market.name }),
    alternates: await languageAlternates(routes.market(market)),
  };
}

/** Params are awaited outside Suspense, so every market URL gets its own cached render and unknown ones a real 404. */
async function MarketPage({ params }: PageProps<'/[locale]/[market]'>) {
  const { market } = await params;
  const page = await getMarketPageData(market);
  if (!page) notFound();
  return <MarketScreen data={page.data} now={page.now} />;
}

export default withClientMessages('[locale]/(public)/[market]/page.tsx', MarketPage);
