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
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { IdentityCheckDialog } from '@/ui/components/layout/identity-check-dialog';
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
 * (app)/app/(flow)/helpers/[handle]/request). An ID check the risk rules ask for first is said in the dialog, the check
 * itself in a new tab (2026-11-23).
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
  // "Invite helpers" on one of the client's tasks (2026-11-23): that task, chosen to start with.
  const taskId = typeof query.task === 'string' && query.task ? query.task : undefined;
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.requestHelper(handle, { fromBookingId: from, slotId, taskId })));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = await requestNow();
  // An ID check the risk rules ask for first: said in the dialog, with the check in a new tab (2026-11-23, owner: "I hate
  // redirect"), instead of sending the page there. The full page still goes to it.
  const idCheck = await posterIdentityRequirement(deps.db, viewer.user.id, now);
  if (idCheck) return <IdentityCheckDialog reason={idCheck.reason} verifyHref={routes.app.verifyIdentity(routes.app.requestHelper(handle, { fromBookingId: from, slotId, taskId }))} />;
  const data = await getRequestHelperPage(deps.db, deps.payments, viewer.user.id, handle, { fromBookingId: from, slotId, taskId }, now);
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
