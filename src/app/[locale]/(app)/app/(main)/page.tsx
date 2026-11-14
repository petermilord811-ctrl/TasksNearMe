import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getAppHome } from '@/modules/home/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HomeScreen } from '@/ui/screens/home';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Home', robots: { index: false } };

/** The signed-in home for the viewer's mode: needs your attention, then what's coming up. */
function AppHomePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  const now = await requestNow();
  const data = await getAppHome(db, { id: viewer.user.id, firstName: viewer.user.firstName, mode: viewer.user.mode }, now);
  return <HomeScreen data={data} now={now.toISOString()} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/page.tsx', AppHomePage);
