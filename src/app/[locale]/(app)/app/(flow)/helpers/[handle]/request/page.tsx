import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingDeps } from '@/modules/bookings/server';
import { finishRequestVerificationAction, quoteInviteAction, requestHelperAction } from '@/modules/invites/actions';
import { getRequestHelperPage } from '@/modules/invites/service';
import { requirePosterIdentity } from '@/modules/verification/poster-identity';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { RequestHelperScreen } from '@/ui/screens/invites';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Request a helper', robots: { index: false } };

/**
 * Ask one helper to do one of your open tasks (blueprint 02 J3): from their profile, saved helpers, or
 * Book again (`?from=booking:<id>` suggests the last task and price). The card is authorized, not charged.
 */
function RequestHelperPage({ params, searchParams }: PageProps<'/[locale]/app/helpers/[handle]/request'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <RequestHelper params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestHelper({ params, searchParams }: Pick<PageProps<'/[locale]/app/helpers/[handle]/request'>, 'params' | 'searchParams'>) {
  const [{ handle }, query, viewer] = await Promise.all([params, searchParams, getViewer()]);
  const from = typeof query.from === 'string' && query.from.startsWith('booking:') ? query.from.slice('booking:'.length) : undefined;
  const slotId = typeof query.slot === 'string' && query.slot ? query.slot : undefined;
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.requestHelper(handle, { fromBookingId: from, slotId })));
  const deps = bookingDeps();
  if (!deps) notFound();
  const now = await requestNow();
  // Risk may ask for an ID check before booking (the amount is checked again on sending).
  await requirePosterIdentity(deps.db, viewer.user.id, now, routes.app.requestHelper(handle, { fromBookingId: from, slotId }));
  const data = await getRequestHelperPage(deps.db, deps.payments, viewer.user.id, handle, { fromBookingId: from, slotId }, now);
  if (!data) notFound();
  return (
    <RequestHelperScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onQuote: quoteInviteAction,
        onRequest: requestHelperAction.bind(null, handle),
        onFinishVerification: finishRequestVerificationAction,
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/helpers/[handle]/request/page.tsx', RequestHelperPage);
