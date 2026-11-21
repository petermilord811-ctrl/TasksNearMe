import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { proposeChangeAction, quoteChangeAction } from '@/modules/bookings/change-actions';
import { getProposeChangePage } from '@/modules/bookings/changes';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ProposeChangeDialogScreen } from '@/ui/screens/bookings';

type Params = Promise<{ bookingId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('proposeChange');
}

/** Either person proposes new terms over the booking (the full page: (app)/app/(flow)/bookings/[bookingId]/changes/new). */
function ProposeChangeDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <ProposeChange params={params} />
    </Suspense>
  );
}

async function ProposeChange({ params }: { params: Params }) {
  const [{ bookingId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.bookingProposeChange(bookingId)));
  const now = await requestNow();
  const data = await getProposeChangePage(db, viewer.user.id, bookingId, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ProposeChangeDialogScreen data={data} now={now.toISOString()} handlers={{ onQuote: quoteChangeAction.bind(null, bookingId), onPropose: proposeChangeAction.bind(null, bookingId) }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/bookings/[bookingId]/changes/new/page.tsx', ProposeChangeDialogPage);
