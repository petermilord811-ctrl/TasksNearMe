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
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { IdentityCheckDialog } from '@/ui/components/layout/identity-check-dialog';
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
  // An ID check the risk rules ask for first: said in the dialog, with the check in a new tab (2026-11-23), instead of
  // sending the page there. The full page still goes to it.
  const idCheck = await posterIdentityRequirement(deps.db, viewer.user.id, now, breakdown.posterChargedCents ?? breakdown.posterTotalCents);
  if (idCheck) return <IdentityCheckDialog reason={idCheck.reason} verifyHref={routes.app.verifyIdentity(routes.app.confirmOffer(taskId, offerId))} />;
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
