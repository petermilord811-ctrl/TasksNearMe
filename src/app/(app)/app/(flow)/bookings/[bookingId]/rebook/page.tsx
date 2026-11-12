import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { proposeRebookAction, quoteRebookAction } from '@/modules/rebook/actions';
import { getProposeRebookPage } from '@/modules/rebook/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ProposeRebookScreen } from '@/ui/screens/clients';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Propose a booking', robots: { index: false } };

/**
 * The helper proposes doing a past client's task again (blueprint 02 J8): a new time and a price, the last
 * one suggested. Only the helper of the completed booking gets here; anyone else sees not found.
 */
export default function RebookPage({ params }: PageProps<'/app/bookings/[bookingId]/rebook'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Rebook params={params} />
    </Suspense>
  );
}

async function Rebook({ params }: Pick<PageProps<'/app/bookings/[bookingId]/rebook'>, 'params'>) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingRebook(bookingId)));
  const now = await requestNow();
  const data = await getProposeRebookPage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <ProposeRebookScreen
      data={data}
      now={now.toISOString()}
      handlers={{ onQuote: quoteRebookAction.bind(null, bookingId), onPropose: proposeRebookAction.bind(null, bookingId) }}
    />
  );
}
