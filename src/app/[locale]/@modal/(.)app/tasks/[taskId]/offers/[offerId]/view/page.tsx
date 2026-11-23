import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { posterOfferAction } from '@/modules/offers/actions';
import { getOfferDetail } from '@/modules/offers/owner';
import { ownerDepsFor } from '@/modules/offers/server';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { OfferDetailDialogScreen } from '@/ui/screens/tasks';

type Params = Promise<{ taskId: string; offerId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('offer');
}

/**
 * One offer over the task, the dashboard or the conversation it was opened from (2026-11-23), at its own address
 * (`routes.app.offerView`): the offer's page stays a page, since checkout opens as a dialog over it (a dialog at the
 * same address reloaded the page under checkout after a declined card). Opening it marks it seen, as the page does.
 */
function OfferDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Offer params={params} />
    </Suspense>
  );
}

async function Offer({ params }: { params: Params }) {
  const [{ taskId, offerId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.offer(taskId, offerId)));
  const deps = await ownerDepsFor(viewer.user.id);
  const now = await requestNow();
  const data = deps ? await getOfferDetail(deps, viewer.user.id, taskId, offerId, now) : null;
  if (!data) notFound();
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <OfferDetailDialogScreen data={data} now={now.toISOString()} handlers={{ onOfferAction: posterOfferAction }} />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/tasks/[taskId]/offers/[offerId]/view/page.tsx', OfferDialogPage);
