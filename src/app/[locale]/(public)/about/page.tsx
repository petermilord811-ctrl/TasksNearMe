import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routes } from '@/contracts';
import { publicPageMetadata, structuredDataContext } from '@/i18n/metadata';
import { JsonLd } from '@/modules/seo/json-ld';
import { aboutPageNode, organizationNode } from '@/modules/seo/structured-data';
import { AboutScreen } from '@/ui/screens/public/about-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.about');
  return publicPageMetadata({ path: routes.about(), title: { absolute: t('title') }, description: t('description') });
}

/**
 * About TasksNearMe (docs/seo/PLAN.md §11): who runs the site and what it stands for. Its structured data is a page
 * about the organization and the organization itself, the same node as on the home page (one @id), which is where
 * Google's organization guide asks for it.
 */
export default async function AboutPage() {
  const [context, meta, site] = await Promise.all([structuredDataContext(), getTranslations('server.meta.about'), getTranslations('server.meta.site')]);
  return (
    <>
      <JsonLd nodes={[aboutPageNode(context, { name: meta('title'), description: meta('description') }), organizationNode(context, site('description'))]} />
      <AboutScreen />
    </>
  );
}
