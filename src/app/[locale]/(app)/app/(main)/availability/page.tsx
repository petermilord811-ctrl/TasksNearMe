import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { cancelAvailabilityPostAction, createAvailabilityPostAction } from '@/modules/availability/actions';
import { getMyAvailabilityPage } from '@/modules/availability/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { MyAvailabilityScreen } from '@/ui/screens/availability';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'My availability', robots: { index: false } };

/** The helper's open slots: post one, see requests, cancel (blueprint 02 J3 step 4). */
function MyAvailabilityPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Availability />
    </Suspense>
  );
}

async function Availability() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.availability()));
  const now = await requestNow();
  const data = await getMyAvailabilityPage(db, viewer.user.id, now);
  return <MyAvailabilityScreen data={data} now={now.toISOString()} handlers={{ onCreate: createAvailabilityPostAction, onCancel: cancelAvailabilityPostAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/availability/page.tsx', MyAvailabilityPage);
