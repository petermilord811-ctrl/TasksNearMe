import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingDeps } from '@/modules/bookings/server';
import { removeCardAction } from '@/modules/earnings/actions';
import { finishRequestVerificationAction, quoteInviteAction, requestHelperAction } from '@/modules/invites/actions';
import { getRequestHelperPage } from '@/modules/invites/service';
import { requirePosterIdentity } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { RequestHelperDialogScreen } from '@/ui/screens/invites';

type Params = Promise<{ handle: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('requestHelper');
}

/**
 * Request this helper over the profile, the list or the booking it was opened from (the full page:
 * (app)/app/(flow)/helpers/[handle]/request). An ID check the risk rules ask for first is its own page, as there.
 */
function RequestHelperDialogPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <RequestHelper params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestHelper({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ handle }, query, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const from = typeof query.from === 'string' && query.from.startsWith('booking:') ? query.from.slice('booking:'.length) : undefined;
  const slotId = typeof query.slot === 'string' && query.slot ? query.slot : undefined;
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.requestHelper(handle, { fromBookingId: from, slotId })));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = await requestNow();
  await requirePosterIdentity(deps.db, viewer.user.id, now, routes.app.requestHelper(handle, { fromBookingId: from, slotId }));
  const data = await getRequestHelperPage(deps.db, deps.payments, viewer.user.id, handle, { fromBookingId: from, slotId }, now);
  if (!data) notFound();
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <RequestHelperDialogScreen
        data={data}
        now={now.toISOString()}
        handlers={{ onQuote: quoteInviteAction, onRequest: requestHelperAction.bind(null, handle), onFinishVerification: finishRequestVerificationAction, onRemoveCard: removeCardAction }}
      />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/helpers/[handle]/request/page.tsx', RequestHelperDialogPage);
