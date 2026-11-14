import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { createSavedSearchAction } from '@/modules/searches/actions';
import { getNewSavedSearchPage } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { NewSavedSearchScreen } from '@/ui/screens/searches/new-saved-search-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedSearches.new');
  return { title: t('title'), robots: { index: false } };
}

/** Save the board view in `?from=` (completion plan 7.10). */
function NewSavedSearchPage({ searchParams }: PageProps<'/[locale]/app/saved-searches/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewSavedSearch searchParams={searchParams} />
    </Suspense>
  );
}

async function NewSavedSearch({ searchParams }: Pick<PageProps<'/[locale]/app/saved-searches/new'>, 'searchParams'>) {
  const search = await searchParams;
  const from = (Array.isArray(search.from) ? search.from[0] : search.from) ?? '';
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newSavedSearch(from)));
  const data = from ? await getNewSavedSearchPage(db, viewer.user.id, from) : null;
  if (!data) notFound();
  return <NewSavedSearchScreen data={data} handlers={{ onSave: createSavedSearchAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/saved-searches/new/page.tsx', NewSavedSearchPage);
