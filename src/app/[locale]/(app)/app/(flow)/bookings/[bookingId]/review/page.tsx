import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { submitReviewAction } from '@/modules/reviews/actions';
import { getReviewPage } from '@/modules/reviews/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ReviewScreen } from '@/ui/screens/reviews';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Leave a review', robots: { index: false } };

/** Either person on a completed booking reviews the other (double-blind). */
export default function ReviewPage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]/review'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]/review'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingReview(bookingId)));
  const now = await requestNow();
  const data = await getReviewPage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  return <ReviewScreen data={data} now={now.toISOString()} handlers={{ onSubmit: submitReviewAction.bind(null, bookingId) }} />;
}
