import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { proposeRebookAction, quoteRebookAction } from '@/modules/rebook/actions';
import { getProposeRebookPage } from '@/modules/rebook/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ProposeRebookDialogScreen } from '@/ui/screens/clients';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('rebook');
}

/**
 * The helper proposes a past client's task again, over the booking or My clients (the full page:
 * (app)/app/(flow)/bookings/[bookingId]/rebook). Only the helper of the completed booking gets it; anyone else, not found.
 */
function RebookDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Rebook params={params} />
    </Suspense>
  );
}

async function Rebook({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingRebook(bookingId)));
  const now = await requestNow();
  const data = await getProposeRebookPage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ProposeRebookDialogScreen data={data} now={now.toISOString()} handlers={{ onQuote: quoteRebookAction.bind(null, bookingId), onPropose: proposeRebookAction.bind(null, bookingId) }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/rebook/page.tsx', RebookDialogPage);
