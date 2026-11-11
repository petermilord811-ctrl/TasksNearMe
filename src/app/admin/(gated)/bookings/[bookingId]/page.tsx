import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { staffActorOf } from '@/modules/support/staff';
import { revealBookingAddressAction, revealBookingConversationAction, staffRefundAction } from '@/modules/support/staff-actions';
import { getAdminBooking } from '@/modules/support/staff-money';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminBookingScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

/** One booking for staff: money, cases, refunds, and restricted data behind a logged reason. */
export default function AdminBookingPage({ params }: PageProps<'/admin/bookings/[bookingId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminBooking params={params} />
    </Suspense>
  );
}

async function AdminBooking({ params }: Pick<PageProps<'/admin/bookings/[bookingId]'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = new Date();
  const data = await getAdminBooking(db, staff, bookingId, now);
  if (!data) notFound();
  return (
    <AdminBookingScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onRefund: staffRefundAction.bind(null, bookingId),
        onRevealAddress: revealBookingAddressAction.bind(null, bookingId),
        onRevealConversation: revealBookingConversationAction.bind(null, bookingId),
      }}
    />
  );
}
