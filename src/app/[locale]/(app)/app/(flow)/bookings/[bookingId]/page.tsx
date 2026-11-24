import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingActionHandler } from '@/modules/bookings/hub-actions';
import {
  cancelBookingAction,
  cantAccessAction,
  previewCancelAction,
  reportNoShowAction,
  runningLateAction,
  safetyReportAction,
} from '@/modules/bookings/sheet-actions';
import { getBookingView } from '@/modules/bookings/hub';
import { finishTipVerificationAction, tipAction } from '@/modules/bookings/tip-actions';
import { deleteThanksAction, hideThanksNameAction, saveThanksAction, showThanksOnProfileAction } from '@/modules/thanks/actions';
import { finishScheduledVerificationAction, payScheduledAction } from '@/modules/bookings/series-actions';
import { removeCardAction } from '@/modules/earnings/actions';
import { hubDeps } from '@/modules/bookings/server';
import { getViewer } from '@/platform/auth/viewer';
import { BookingHubScreen } from '@/ui/screens/bookings';
import { requestNow } from '@/platform/clock';
import { BookingHubSkeleton } from '@/ui/screens/bookings/booking-hub-skeleton';
import { appPageMetadata } from '@/i18n/metadata';
import { taskMapFor } from '@/modules/task-map/service';
import { db } from '@/platform/db/client';
import { addFollowerAction, leaveFollowAction, removeFollowerAction } from '@/modules/followers/actions';
import { getFollowedBookingView } from '@/modules/followers/service';
import { FollowedBookingScreen } from '@/ui/screens/bookings/followed-booking-screen';
import { MarketTime } from '@/ui/lib/market-time';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('booking');
}

/** One booking for its client or its helper (anyone else: not found). */
function BookingPage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]'>) {
  return (
    <Suspense fallback={<BookingHubSkeleton />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.booking(bookingId)));
  const now = await requestNow();
  const data = await getBookingView(hubDeps(), viewer.user.id, bookingId, now);
  if (!data) {
    // A family member who follows it (2026-11-24): the read-only page, on the booking's market clock. Anyone else: not found.
    const followed = await getFollowedBookingView(db, viewer.user.id, bookingId, now);
    if (!followed) notFound();
    return <MarketTime timeZone={followed.timeZone}><FollowedBookingScreen data={followed} now={now.toISOString()} handlers={{ onLeave: leaveFollowAction }} /></MarketTime>;
  }
  // The task map: the trip there (the helper's from home or where they are), the weather for the booking, what's around.
  const map = await taskMapFor(db, { task: { ...data.task, location: data.location }, viewer: { kind: data.viewerRole, userId: viewer.user.id }, now });
  return (
    <BookingHubScreen
      data={data}
      now={now.toISOString()}
      map={map}
      handlers={{ onAction: bookingActionHandler.bind(null, bookingId) }}
      sheets={{
        onPreviewCancel: previewCancelAction.bind(null, bookingId),
        onCancel: cancelBookingAction.bind(null, bookingId),
        onRunningLate: runningLateAction.bind(null, bookingId),
        onReportNoShow: reportNoShowAction.bind(null, bookingId),
        onCantAccess: cantAccessAction.bind(null, bookingId),
        onSafetyReport: safetyReportAction.bind(null, bookingId),
      }}
      tip={{ onTip: tipAction.bind(null, bookingId), onFinishTipVerification: finishTipVerificationAction.bind(null, bookingId), onRemoveCard: removeCardAction }}
      scheduledPayment={{ onPayNow: payScheduledAction.bind(null, bookingId), onFinishPayVerification: finishScheduledVerificationAction.bind(null, bookingId), onRemoveCard: removeCardAction }}
      thanks={{ onSave: saveThanksAction.bind(null, 'page'), onDelete: deleteThanksAction.bind(null, 'page'), onShowOnProfile: showThanksOnProfileAction.bind(null, 'page'), onHideName: hideThanksNameAction.bind(null, 'page') }}
      followers={{ onAdd: addFollowerAction.bind(null, 'page'), onRemove: removeFollowerAction.bind(null, 'page') }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/bookings/[bookingId]/page.tsx', BookingPage);
