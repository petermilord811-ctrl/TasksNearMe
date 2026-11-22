import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { searchWithAi } from '@/modules/home/actions';
import { neighborsCard } from '@/modules/community/home';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { getDashboard } from '@/modules/home/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { DashboardScreen } from '@/ui/screens/home';
import { requestNow } from '@/platform/clock';
import { parseDashboardQuery } from '@/shared/dashboard';
import { DashboardSkeleton } from '@/ui/screens/home/dashboard-skeleton';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('home');
}

/**
 * The signed-in home as a dashboard (completion plan 9.9): what needs the person, then their tasks, offers and
 * bookings with the filters in the URL, and AI search where the plan allows it.
 */
function AppHomePage({ searchParams }: PageProps<'/[locale]/app'>) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

async function Home({ searchParams }: Pick<PageProps<'/[locale]/app'>, 'searchParams'>) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  const now = await requestNow();
  const [dashboard, neighbors] = await Promise.all([
    getDashboard(db, { id: viewer.user.id, firstName: viewer.user.firstName, mode: viewer.user.mode, timeZone: viewer.user.timeZone }, parseDashboardQuery(params), now),
    // "From your neighbors" (plan 10.19).
    communityViewerOf(viewer.user).then((reader) => neighborsCard(db, reader, now)),
  ]);
  const data = neighbors ? { ...dashboard, neighbors } : dashboard;
  // Ask AI only where the plan allows it (completion plan 9.13); the Server Action checks again and counts.
  return <DashboardScreen data={data} now={now.toISOString()} handlers={data.aiSearch.allowed ? { onAiSearch: searchWithAi } : {}} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/page.tsx', AppHomePage);
