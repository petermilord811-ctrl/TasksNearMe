import { withClientMessages } from '@/i18n/client-messages';
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
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('rebook');
}

/**
 * The helper proposes doing a past client's task again (blueprint 02 J8): a new time and a price, the last
 * one suggested. Only the helper of the completed booking gets here; anyone else sees not found.
 */
function RebookPage({ params }: PageProps<'/[locale]/app/bookings/[bookingId]/rebook'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <Rebook params={params} />
    </Suspense>
  );
}

async function Rebook({ params }: Pick<PageProps<'/[locale]/app/bookings/[bookingId]/rebook'>, 'params'>) {
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

export default withClientMessages('[locale]/(app)/app/(flow)/bookings/[bookingId]/rebook/page.tsx', RebookPage);
