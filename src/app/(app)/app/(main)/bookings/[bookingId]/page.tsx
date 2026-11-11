import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingActionHandler } from '@/modules/bookings/hub-actions';
import { getBookingView } from '@/modules/bookings/hub';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { BookingHubScreen } from '@/ui/screens/bookings';

export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

/** One booking for its client or its helper (anyone else: not found). */
export default function BookingPage({ params }: PageProps<'/app/bookings/[bookingId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: Pick<PageProps<'/app/bookings/[bookingId]'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.booking(bookingId)));
  const now = new Date();
  const data = await getBookingView(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) notFound();
  return <BookingHubScreen data={data} now={now.toISOString()} handlers={{ onAction: bookingActionHandler.bind(null, bookingId) }} />;
}
