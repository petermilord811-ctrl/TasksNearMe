import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE_NAME } from '@/modules/seo/structured-data';
import { NotFoundScreen } from '@/ui/screens/not-found/not-found-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.notFound');
  // Absolute, with the site's name: a 404's title is merged once for each branch under the root layout (the page and
  // the dialog slot, src/app/[locale]/@modal), and a templated one loses the "%s · TasksNearMe" template the second time.
  return { title: { absolute: `${t('title')} · ${SITE_NAME}` }, description: t('description') };
}

/**
 * A public page that isn't there (an unknown city, category, help article, task or helper; any one-segment address
 * lands in [market], and deeper ones in [...missing]): in the site's shell, with the ways on. The pages call
 * notFound() before their Suspense, so the status stays a real 404 (and Next adds noindex).
 */
export default function PublicNotFound() {
  return <NotFoundScreen />;
}
