import type { Metadata } from 'next';
import { withClientMessages } from '@/i18n/client-messages';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { staffActorOf } from '@/modules/support/staff';
import { decideRefundAction, revealBookingAddressAction, revealBookingConversationAction, staffRefundAction } from '@/modules/support/staff-actions';
import { getAdminBooking } from '@/modules/support/staff-money';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminBookingScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';
import { getBookingReversals } from '@/modules/payments/reversals';
import { reverseTransferAction } from '@/modules/payments/reversal-actions';
import { staffCancelView } from '@/modules/bookings/sheets';
import { staffCancelBookingAction } from '@/modules/bookings/staff-cancel-actions';

export const metadata: Metadata = { title: 'Booking', robots: { index: false } };

/** One booking for staff: money, cases, refunds, and restricted data behind a logged reason. */
function AdminBookingPage({ params }: PageProps<'/[locale]/admin/bookings/[bookingId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminBooking params={params} />
    </Suspense>
  );
}

async function AdminBooking({ params }: Pick<PageProps<'/[locale]/admin/bookings/[bookingId]'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const [booking, reversals] = await Promise.all([getAdminBooking(db, staff, bookingId, now), getBookingReversals(db, staff, bookingId)]);
  if (!booking) notFound();
  const staffCancel = await staffCancelView(db, staff.roles, booking.booking, staff.id);
  const data = { ...booking, reversals, ...(staffCancel ? { staffCancel } : {}) };
  return (
    <AdminBookingScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onRefund: staffRefundAction.bind(null, bookingId),
        onDecideRefund: decideRefundAction.bind(null, bookingId),
        onRevealAddress: revealBookingAddressAction.bind(null, bookingId),
        onRevealConversation: revealBookingConversationAction.bind(null, bookingId),
        onReverseTransfer: reverseTransferAction.bind(null, bookingId),
        onStaffCancel: staffCancelBookingAction.bind(null, bookingId),
      }}
    />
  );
}

export default withClientMessages('[locale]/admin/(gated)/bookings/[bookingId]/page.tsx', AdminBookingPage);
