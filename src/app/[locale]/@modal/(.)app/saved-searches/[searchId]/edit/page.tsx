import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { updateSavedSearchAction } from '@/modules/searches/actions';
import { getEditSavedSearchPage } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { EditSavedSearchDialog } from '@/ui/screens/searches/edit-saved-search-screen';

type Params = Promise<{ searchId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedSearches.edit');
  return { title: t('title'), robots: { index: false } };
}

/** Edit a saved search over the list (the full page: (app)/app/(main)/saved-searches/[searchId]/edit). */
function EditSavedSearchDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <EditSavedSearch params={params} />
    </Suspense>
  );
}

async function EditSavedSearch({ params }: { params: Params }) {
  const { searchId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.editSavedSearch(searchId)));
  const data = await getEditSavedSearchPage(db, viewer.user.id, searchId, await requestNow());
  if (!data) notFound();
  return <EditSavedSearchDialog data={data} handlers={{ onSave: updateSavedSearchAction }} />;
}

export default withClientMessages('[locale]/@modal/(.)app/saved-searches/[searchId]/edit/page.tsx', EditSavedSearchDialogPage);
