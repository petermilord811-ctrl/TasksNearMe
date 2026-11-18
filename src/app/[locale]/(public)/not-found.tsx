import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotFoundScreen } from '@/ui/screens/not-found/not-found-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.notFound');
  return { title: t('title'), description: t('description') };
}

/**
 * A public page that isn't there (an unknown city, category, help article, task or helper; any one-segment address
 * lands in [market], and deeper ones in [...missing]): in the site's shell, with the ways on. The pages call
 * notFound() before their Suspense, so the status stays a real 404 (and Next adds noindex).
 */
export default function PublicNotFound() {
  return <NotFoundScreen />;
}
