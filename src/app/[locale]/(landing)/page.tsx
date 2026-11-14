import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/contracts';
import { suggestTaskWithAi } from '@/modules/marketing/assistant-actions';
import { getHomePageData } from '@/modules/marketing/queries';
import { JsonLd } from '@/modules/seo/json-ld';
import { organizationNode, websiteNode } from '@/modules/seo/structured-data';
import { LandingHandlersProvider } from '@/ui/landing/landing-handlers';
import { HomeScreen } from '@/ui/screens/public';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const [page, t] = await Promise.all([getHomePageData(), getTranslations('server.meta.home')]);
  const market = page?.data.market.name ?? '';
  return publicPageMetadata({ path: routes.home(), title: { absolute: t('title', { market }) }, description: t('description', { market }) });
}

/** Home for the default market. Data is cached, so the page prerenders. */
async function HomePage() {
  const page = await getHomePageData();
  if (!page) notFound();
  const [context, site] = await Promise.all([structuredDataContext(), getTranslations('server.meta.site')]);
  return (
    <>
      {/* The site's name and logo for search results. */}
      <JsonLd nodes={[organizationNode(context, site('description')), websiteNode(context, site('description'))]} />
      {/* The hero's assistant can write a task with AI for visitors (rate-limited, never stored). */}
      <LandingHandlersProvider handlers={{ onSuggestWithAi: suggestTaskWithAi }}>
        <HomeScreen data={page.data} now={page.now} />
      </LandingHandlersProvider>
    </>
  );
}

export default withClientMessages('[locale]/(landing)/page.tsx', HomePage);
