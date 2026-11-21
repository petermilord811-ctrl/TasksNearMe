import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { createPaymentProvider } from '@/integrations/payments';
import { acceptChangeAction, declineChangeAction, finishChangeVerificationAction, payChangeDifferenceAction, withdrawChangeAction } from '@/modules/bookings/change-actions';
import { getChangeReviewPage } from '@/modules/bookings/changes';
import { removeCardAction } from '@/modules/earnings/actions';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ChangeReviewDialogScreen } from '@/ui/screens/bookings';

type Params = Promise<{ bookingId: string; changeId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('changeRequest');
}

/** A proposed change over the booking (the full page: (app)/app/(flow)/bookings/[bookingId]/changes/[changeId]). */
function ChangeReviewDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <ChangeReview params={params} />
    </Suspense>
  );
}

async function ChangeReview({ params }: { params: Params }) {
  const [{ bookingId, changeId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingChange(bookingId, changeId)));
  const now = await requestNow();
  const data = await getChangeReviewPage(db, createPaymentProvider(), viewer.user.id, bookingId, changeId, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ChangeReviewDialogScreen
        data={data}
        now={now.toISOString()}
        handlers={{
          onAccept: acceptChangeAction.bind(null, bookingId, changeId),
          onPayDifference: payChangeDifferenceAction.bind(null, bookingId, changeId),
          onFinishVerification: finishChangeVerificationAction.bind(null, bookingId, changeId),
          onDecline: declineChangeAction.bind(null, bookingId, changeId),
          onWithdraw: withdrawChangeAction.bind(null, bookingId, changeId),
          onRemoveCard: removeCardAction,
        }}
      />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/changes/[changeId]/page.tsx', ChangeReviewDialogPage);
