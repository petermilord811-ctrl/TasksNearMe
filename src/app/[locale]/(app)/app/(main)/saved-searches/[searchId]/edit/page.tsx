import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { updateSavedSearchAction } from '@/modules/searches/actions';
import { getEditSavedSearchPage } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { EditSavedSearchScreen } from '@/ui/screens/searches/edit-saved-search-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedSearches.edit');
  return { title: t('title'), robots: { index: false } };
}

/** Rename a saved search, change its alerts and its filters (completion plan 7.10, sweep SS5). */
function EditSavedSearchPage({ params }: PageProps<'/[locale]/app/saved-searches/[searchId]/edit'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <EditSavedSearch params={params} />
    </Suspense>
  );
}

async function EditSavedSearch({ params }: Pick<PageProps<'/[locale]/app/saved-searches/[searchId]/edit'>, 'params'>) {
  const { searchId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.editSavedSearch(searchId)));
  const data = await getEditSavedSearchPage(db, viewer.user.id, searchId, await requestNow());
  if (!data) notFound();
  return <EditSavedSearchScreen data={data} handlers={{ onSave: updateSavedSearchAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/saved-searches/[searchId]/edit/page.tsx', EditSavedSearchPage);
