import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getMyOffers } from '@/modules/offers/helper';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { MyOffersScreen } from '@/ui/screens/work';

export const metadata: Metadata = { title: 'My offers', robots: { index: false } };

/** The helper's offers: active, booked, and closed. Invites received join this page with UI-025. */
export default function MyOffersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Offers />
    </Suspense>
  );
}

async function Offers() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.offers()));
  const now = new Date();
  const data = await getMyOffers(db, viewer.user.id, now);
  return <MyOffersScreen data={data} now={now.toISOString()} />;
}
