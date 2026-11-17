import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/contracts';
import { getStateCitiesPageData } from '@/modules/marketing/cities';
import { KEEP_OUT_OF_SEARCH } from '@/modules/seo/indexable';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { searchEngineRows } from '@/shared/sample-data';
import { DIRECTORY_STATES, stateCodeOfSlug, statePageIndexable, type DirectoryStateCode } from '@/shared/us-states';
import { StateCitiesScreen } from '@/ui/screens/public/cities-screen';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

/**
 * One state's page (completion plan 8.7): its open cities, the cities people asked for, the waitlist and helper
 * sign-up. Indexed only with something real to show (an open city or a listed coming-next city); otherwise
 * `noindex, follow` and out of the sitemap, so dozens of empty state pages never read as doorway pages.
 */
export function generateStaticParams() {
  return DIRECTORY_STATES.map(([, state]) => ({ state }));
}

async function load(stateSlug: string) {
  const code = stateCodeOfSlug(stateSlug);
  if (!code) return null;
  const [context, states] = await Promise.all([structuredDataContext(), getTranslations('server.states')]);
  return { context, data: await getStateCitiesPageData(code, searchEngineRows(), (other: DirectoryStateCode) => states(other), context.locale) };
}

export async function generateMetadata({ params }: PageProps<'/[locale]/cities/[state]'>): Promise<Metadata> {
  const { state } = await params;
  const page = await load(state);
  if (!page) return {};
  const t = await getTranslations('server.meta.citiesState');
  const values = { state: page.data.state.name };
  return {
    ...(await publicPageMetadata({ path: routes.cities(page.data.state.slug), title: t('title', values), description: t('description', values) })),
    ...(statePageIndexable(page.data.state) ? {} : KEEP_OUT_OF_SEARCH),
  };
}

export default async function StateCitiesPage({ params }: PageProps<'/[locale]/cities/[state]'>) {
  const { state } = await params;
  const page = await load(state);
  if (!page) notFound();
  const [cities] = await Promise.all([getTranslations('server.meta.cities')]);
  const { context, data } = page;
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbNode(context, [
            { name: SITE_NAME, path: routes.home() },
            { name: cities('crumb'), path: routes.cities() },
            { name: data.state.name, path: routes.cities(data.state.slug) },
          ]),
        ]}
      />
      <StateCitiesScreen data={data} />
    </>
  );
}
