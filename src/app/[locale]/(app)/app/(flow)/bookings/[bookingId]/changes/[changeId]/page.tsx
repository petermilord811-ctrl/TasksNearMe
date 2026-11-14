import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { createPaymentProvider } from '@/integrations/payments';
import {
  acceptChangeAction,
  declineChangeAction,
  finishChangeVerificationAction,
  payChangeDifferenceAction,
  withdrawChangeAction,
} from '@/modules/bookings/change-actions';
import { getChangeReviewPage } from '@/modules/bookings/changes';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ChangeReviewScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Change request', robots: { index: false } };

/** A change request for the two people on the booking (anyone else: not found). */
function ChangeReviewPage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]/changes/[changeId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <ChangeReview params={params} />
    </Suspense>
  );
}

async function ChangeReview({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]/changes/[changeId]'>, 'params'>) {
  const [{ bookingId, changeId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingChange(bookingId, changeId)));
  const now = await requestNow();
  const data = await getChangeReviewPage(db, createPaymentProvider(), viewer.user.id, bookingId, changeId, now);
  if (!data) notFound();
  return (
    <ChangeReviewScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onAccept: acceptChangeAction.bind(null, bookingId, changeId),
        onPayDifference: payChangeDifferenceAction.bind(null, bookingId, changeId),
        onFinishVerification: finishChangeVerificationAction.bind(null, bookingId, changeId),
        onDecline: declineChangeAction.bind(null, bookingId, changeId),
        onWithdraw: withdrawChangeAction.bind(null, bookingId, changeId),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/bookings/[bookingId]/changes/[changeId]/page.tsx', ChangeReviewPage);
