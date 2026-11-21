import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { confirmBookingAction, finishBankVerificationAction } from '@/modules/bookings/actions';
import { getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingDeps } from '@/modules/bookings/server';
import { removeCardAction } from '@/modules/earnings/actions';
import { requirePosterIdentity } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { BookingConfirmDialogScreen } from '@/ui/screens/bookings';

type Params = Promise<{ taskId: string; offerId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('confirmAndPay');
}

/**
 * Confirm and pay over the task, the offer or the booking it was opened from (the full page:
 * (app)/app/(flow)/tasks/[taskId]/offers/[offerId]/confirm). Already booked: the booking; an ID check first: its page.
 */
function ConfirmDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Confirm params={params} />
    </Suspense>
  );
}

async function Confirm({ params }: { params: Params }) {
  const [{ taskId, offerId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.confirmOffer(taskId, offerId)));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = await requestNow();
  const page = await getBookingConfirmPage(deps, viewer.user.id, taskId, offerId, now);
  if (!page) notFound();
  if (page.kind === 'booked') redirect(routes.app.booking(page.bookingId));
  const { breakdown } = page.data;
  await requirePosterIdentity(deps.db, viewer.user.id, now, routes.app.confirmOffer(taskId, offerId), breakdown.posterChargedCents ?? breakdown.posterTotalCents);
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <BookingConfirmDialogScreen
        data={page.data}
        now={now.toISOString()}
        handlers={{ onConfirm: confirmBookingAction.bind(null, taskId, offerId), onFinishVerification: finishBankVerificationAction, onRemoveCard: removeCardAction }}
      />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/tasks/[taskId]/offers/[offerId]/confirm/page.tsx', ConfirmDialogPage);
