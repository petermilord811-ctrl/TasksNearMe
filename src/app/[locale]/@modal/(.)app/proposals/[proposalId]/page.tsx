import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingDeps, hubDeps } from '@/modules/bookings/server';
import { removeCardAction } from '@/modules/earnings/actions';
import { acceptProposalAction, declineProposalAction, finishProposalVerificationAction, withdrawProposalAction } from '@/modules/rebook/actions';
import { getProposalPage } from '@/modules/rebook/service';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { ProposalDialogScreen } from '@/ui/screens/clients';

type Params = Promise<{ proposalId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('proposal');
}

/**
 * A rebooking proposal over the page it was opened from (2026-11-23: My clients, the dashboard, a notification; the full
 * page: (app)/app/(flow)/proposals/[proposalId]), for its two people only.
 */
function ProposalDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <Proposal params={params} />
    </Suspense>
  );
}

async function Proposal({ params }: { params: Params }) {
  const [{ proposalId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.proposal(proposalId)));
  const now = await requestNow();
  const data = await getProposalPage(db, bookingDeps()?.payments ?? null, hubDeps().cipher, viewer.user.id, proposalId, now);
  if (!data) notFound();
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <ProposalDialogScreen
        data={data}
        now={now.toISOString()}
        handlers={{
          onAccept: acceptProposalAction.bind(null, proposalId),
          onFinishVerification: finishProposalVerificationAction.bind(null, proposalId),
          onDecline: declineProposalAction.bind(null, proposalId),
          onWithdraw: withdrawProposalAction.bind(null, proposalId),
          onRemoveCard: removeCardAction,
        }}
      />
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/proposals/[proposalId]/page.tsx', ProposalDialogPage);
