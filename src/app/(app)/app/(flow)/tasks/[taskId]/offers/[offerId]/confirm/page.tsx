import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { confirmBookingAction, finishBankVerificationAction } from '@/modules/bookings/actions';
import { getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { BookingConfirmScreen } from '@/ui/screens/bookings';

export const metadata: Metadata = { title: 'Confirm and pay', robots: { index: false } };

/** Book an offer: review the terms, pay, and confirm (blueprint 02 J4). */
export default function ConfirmBookingPage({ params }: PageProps<'/app/tasks/[taskId]/offers/[offerId]/confirm'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Confirm params={params} />
    </Suspense>
  );
}

async function Confirm({ params }: Pick<PageProps<'/app/tasks/[taskId]/offers/[offerId]/confirm'>, 'params'>) {
  const [{ taskId, offerId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.confirmOffer(taskId, offerId)));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = new Date();
  const page = await getBookingConfirmPage(deps, viewer.user.id, taskId, offerId, now);
  if (!page) notFound();
  if (page.kind === 'booked') redirect(routes.app.booking(page.bookingId));
  return (
    <BookingConfirmScreen
      data={page.data}
      now={now.toISOString()}
      handlers={{
        onConfirm: confirmBookingAction.bind(null, taskId, offerId),
        onFinishVerification: finishBankVerificationAction,
      }}
    />
  );
}
