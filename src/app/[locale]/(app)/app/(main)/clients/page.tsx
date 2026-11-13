import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getMyClientsPage } from '@/modules/rebook/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { MyClientsScreen } from '@/ui/screens/clients';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'My clients', robots: { index: false } };

/** The helper's past clients, with "Propose a booking" when they can do the same task again (blueprint 01). */
export default function ClientsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Clients />
    </Suspense>
  );
}

async function Clients() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.clients()));
  const now = await requestNow();
  const data = await getMyClientsPage(db, viewer.user.id, now);
  return <MyClientsScreen data={data} now={now.toISOString()} />;
}
