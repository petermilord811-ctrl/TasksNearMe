import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { searchWithAi } from '@/modules/home/actions';
import { getDashboard } from '@/modules/home/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { DashboardScreen } from '@/ui/screens/home';
import { requestNow } from '@/platform/clock';
import { parseDashboardQuery } from '@/shared/dashboard';
import { DashboardSkeleton } from '@/ui/screens/home/dashboard-skeleton';

export const metadata: Metadata = { title: 'Home', robots: { index: false } };

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
  const data = await getDashboard(db, { id: viewer.user.id, firstName: viewer.user.firstName, mode: viewer.user.mode, timeZone: viewer.user.timeZone }, parseDashboardQuery(params), now);
  // Ask AI only where the plan allows it (completion plan 9.13); the Server Action checks again and counts.
  return <DashboardScreen data={data} now={now.toISOString()} handlers={data.aiSearch.allowed ? { onAiSearch: searchWithAi } : {}} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/page.tsx', AppHomePage);
