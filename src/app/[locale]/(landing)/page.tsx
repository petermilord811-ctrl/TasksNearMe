import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { suggestTaskWithAi } from '@/modules/marketing/assistant-actions';
import { getHomePageData } from '@/modules/marketing/queries';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { HomeScreen } from '@/ui/screens/public';
import { languageAlternates } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const [page, t] = await Promise.all([getHomePageData(), getTranslations('server.meta.home')]);
  const market = page?.data.market.name ?? '';
  return { title: { absolute: t('title', { market }) }, description: t('description', { market }), alternates: await languageAlternates('/') };
}

/** Home for the default market. Data is cached, so the page prerenders. */
export default async function HomePage() {
  const page = await getHomePageData();
  if (!page) notFound();
  return (
    // The hero's assistant can write a task with AI for visitors (rate-limited, never stored).
    <LandingHandlersProvider handlers={{ onSuggestWithAi: suggestTaskWithAi }}>
      <HomeScreen data={page.data} now={page.now} />
    </LandingHandlersProvider>
  );
}
