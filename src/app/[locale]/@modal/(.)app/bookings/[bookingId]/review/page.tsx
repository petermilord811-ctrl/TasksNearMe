import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { submitReviewAction } from '@/modules/reviews/actions';
import { draftReviewAction } from '@/modules/assist/ai-actions';
import { aiDraftingEnabledFor } from '@/modules/assist/availability';
import { getReviewPage } from '@/modules/reviews/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ReviewDialogScreen } from '@/ui/screens/reviews';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('review');
}

/** Leave a review over the booking (the full page: (app)/app/(flow)/bookings/[bookingId]/review). */
function ReviewDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingReview(bookingId)));
  const now = await requestNow();
  const data = await getReviewPage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  const drafting = !data.mine && !data.unavailable && (await aiDraftingEnabledFor(db, viewer.user.id));
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ReviewDialogScreen data={data} now={now.toISOString()} handlers={{ onSubmit: submitReviewAction.bind(null, bookingId), ...(drafting ? { onDraftReview: draftReviewAction.bind(null, bookingId) } : {}) }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/review/page.tsx', ReviewDialogPage);
