import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { confirmBookingAction, finishBankVerificationAction } from '@/modules/bookings/actions';
import { getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingDeps } from '@/modules/bookings/server';
import { requirePosterIdentity } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { BookingConfirmScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('confirmAndPay');
}

/** Book an offer: review the terms, pay, and confirm (blueprint 02 J4). */
function ConfirmBookingPage({ params }: PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]/confirm'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Confirm params={params} />
    </Suspense>
  );
}

async function Confirm({ params }: Pick<PageProps<'/[locale]/app/tasks/[taskId]/offers/[offerId]/confirm'>, 'params'>) {
  const [{ taskId, offerId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.confirmOffer(taskId, offerId)));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = await requestNow();
  const page = await getBookingConfirmPage(deps, viewer.user.id, taskId, offerId, now);
  if (!page) notFound();
  if (page.kind === 'booked') redirect(routes.app.booking(page.bookingId));
  // Risk may ask for an ID check before paying; the amount counts for new accounts (blueprint 01 P2).
  const { breakdown } = page.data;
  await requirePosterIdentity(deps.db, viewer.user.id, now, routes.app.confirmOffer(taskId, offerId), breakdown.posterChargedCents ?? breakdown.posterTotalCents);
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

export default withClientMessages('[locale]/(app)/app/(flow)/tasks/[taskId]/offers/[offerId]/confirm/page.tsx', ConfirmBookingPage);
