import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE_NAME } from '@/modules/seo/structured-data';
import { NotFoundScreen } from '@/ui/screens/not-found/not-found-screen';
import { Logo } from '@/ui/shells/logo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('server.meta.notFound');
  // Absolute, with the site's name: a 404's title is merged once for each branch under the root layout (the page and
  // the dialog slot, src/app/[locale]/@modal), and a templated one loses the "%s · TasksNearMe" template the second time.
  return { title: { absolute: `${t('title')} · ${SITE_NAME}` }, description: t('description') };
}

/**
 * Not found where no group has a not-found of its own (an address no route matches, a staff page, sign-in): inside
 * the root layout, so the page's language is on <html> and the theme and fonts apply, with the brand and the ways on
 * (sweep 2026-11-18; it was Next's bare default). Server components and plain links only: Next sends this file with
 * every route under it, so the public site's shell here would ship its client code to every signed-in page. The
 * public site and the signed-in app show theirs inside their own shells ((public)/not-found.tsx, (main), (flow)).
 */
export default function NotFound() {
  return (
    <div className="paper flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-content items-center px-gutter py-3">
        <Logo />
      </header>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-gutter pb-16 outline-none">
        <NotFoundScreen />
      </main>
    </div>
  );
}
