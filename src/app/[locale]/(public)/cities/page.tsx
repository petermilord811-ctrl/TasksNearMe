import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/contracts';
import { getCitiesPageData } from '@/modules/marketing/cities';
import { JsonLd } from '@/modules/seo/json-ld';
import { breadcrumbNode, SITE_NAME } from '@/modules/seo/structured-data';
import { searchEngineRows } from '@/shared/sample-data';
import type { DirectoryStateCode } from '@/shared/us-states';
import { CitiesScreen } from '@/ui/screens/public/cities-screen';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';

/**
 * `/cities` (completion plan 8.7): where TasksNearMe is open, where it goes next and every state. Real data only and the
 * same for every visitor (`searchEngineRows()`), so it prerenders like the other site pages.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.cities');
  return publicPageMetadata({ path: routes.cities(), title: t('title'), description: t('description') });
}

export default async function CitiesPage() {
  const [context, states, meta] = await Promise.all([structuredDataContext(), getTranslations('server.states'), getTranslations('server.meta.cities')]);
  const data = await getCitiesPageData(searchEngineRows(), (code: DirectoryStateCode) => states(code), context.locale);
  return (
    <>
      <JsonLd nodes={[breadcrumbNode(context, [{ name: SITE_NAME, path: routes.home() }, { name: meta('crumb'), path: routes.cities() }])]} />
      <CitiesScreen data={data} />
    </>
  );
}
