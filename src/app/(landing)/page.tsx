import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHomePageData } from '@/modules/marketing/queries';
import { HomeScreen } from '@/ui/screens/public';

export async function generateMetadata(): Promise<Metadata> {
  const [page, t] = await Promise.all([getHomePageData(), getTranslations('server.meta.home')]);
  const market = page?.data.market.name ?? '';
  return { title: { absolute: t('title', { market }) }, description: t('description', { market }) };
}

/** Home for the default market. Data is cached, so the page prerenders. */
export default async function HomePage() {
  const page = await getHomePageData();
  if (!page) notFound();
  return <HomeScreen data={page.data} now={page.now} />;
}
