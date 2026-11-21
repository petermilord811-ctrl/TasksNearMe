import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getBookingsPage } from '@/modules/bookings/hub';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { BookingsScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';
import { BookingsSkeleton } from '@/ui/screens/bookings/bookings-skeleton';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('bookings');
}

/** Every booking as client or helper: needs action, upcoming, past. */
export default function BookingsPage() {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <Bookings />
    </Suspense>
  );
}

async function Bookings() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookings()));
  const now = await requestNow();
  const data = await getBookingsPage(db, viewer.user.id, now);
  return <BookingsScreen data={data} now={now.toISOString()} />;
}
