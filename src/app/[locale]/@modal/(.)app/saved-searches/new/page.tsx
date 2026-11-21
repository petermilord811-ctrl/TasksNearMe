import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { createSavedSearchAction } from '@/modules/searches/actions';
import { getNewSavedSearchPage } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { NewSavedSearchDialog } from '@/ui/screens/searches/new-saved-search-screen';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedSearches.new');
  return { title: t('title'), robots: { index: false } };
}

/** Save the board or find work view in `?from=` over it (the full page: (app)/app/(main)/saved-searches/new). */
function NewSavedSearchDialogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <NewSavedSearch searchParams={searchParams} />
    </Suspense>
  );
}

async function NewSavedSearch({ searchParams }: { searchParams: SearchParams }) {
  const search = await searchParams;
  const from = (Array.isArray(search.from) ? search.from[0] : search.from) ?? '';
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newSavedSearch(from)));
  const data = from ? await getNewSavedSearchPage(db, viewer.user.id, from) : null;
  if (!data) notFound();
  return <NewSavedSearchDialog data={data} handlers={{ onSave: createSavedSearchAction }} />;
}

export default withClientMessages('[locale]/@modal/(.)app/saved-searches/new/page.tsx', NewSavedSearchDialogPage);
