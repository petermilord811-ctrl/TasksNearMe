import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { savedSearchHref } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('savedSearch');
}

/** A saved search (from its alerts): opens its board view, as it is now (completion plan 7.10). */
export default function SavedSearchPage({ params }: PageProps<'/[locale]/app/saved-searches/[searchId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <OpenSavedSearch params={params} />
    </Suspense>
  );
}

async function OpenSavedSearch({ params }: Pick<PageProps<'/[locale]/app/saved-searches/[searchId]'>, 'params'>): Promise<never> {
  const { searchId } = await params;
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.savedSearch(searchId)));
  const href = await savedSearchHref(db, viewer.user.id, searchId);
  if (!href) notFound();
  return redirect(href);
}
