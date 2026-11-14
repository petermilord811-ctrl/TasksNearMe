import { withClientMessages } from '@/i18n/client-messages';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import { deleteSavedSearchAction, setSavedSearchAlertAction } from '@/modules/searches/actions';
import { getSavedSearchesPage } from '@/modules/searches/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { SavedSearchesScreen } from '@/ui/screens/searches/saved-searches-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedSearches');
  return { title: t('title'), robots: { index: false } };
}

/** The viewer's saved searches and their alerts (completion plan 7.10). */
function SavedSearchesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <SavedSearches />
    </Suspense>
  );
}

async function SavedSearches() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.savedSearches()));
  const now = await requestNow();
  const [data, [home]] = await Promise.all([
    getSavedSearchesPage(db, viewer.user.id, now),
    db.select({ slug: markets.slug }).from(users).innerJoin(markets, eq(markets.id, users.homeMarketId)).where(eq(users.id, viewer.user.id)).limit(1),
  ]);
  return <SavedSearchesScreen data={data} boardHref={routes.taskBoard(home?.slug)} handlers={{ onAlert: setSavedSearchAlertAction, onDelete: deleteSavedSearchAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/saved-searches/page.tsx', SavedSearchesPage);
