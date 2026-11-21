import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { bookingDeps, hubDeps } from '@/modules/bookings/server';
import { acceptProposalAction, declineProposalAction, finishProposalVerificationAction, withdrawProposalAction } from '@/modules/rebook/actions';
import { getProposalPage } from '@/modules/rebook/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ProposalScreen } from '@/ui/screens/clients';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('proposal');
}

/**
 * A rebooking proposal, for its two people only: the client accepts by paying (or declines), the helper can
 * withdraw while it waits. The client sees their own address; the helper only the area.
 */
function ProposalPage({ params }: PageProps<'/[locale]/app/proposals/[proposalId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Proposal params={params} />
    </Suspense>
  );
}

async function Proposal({ params }: Pick<PageProps<'/[locale]/app/proposals/[proposalId]'>, 'params'>) {
  const [{ proposalId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.proposal(proposalId)));
  const now = await requestNow();
  const data = await getProposalPage(db, bookingDeps()?.payments ?? null, hubDeps().cipher, viewer.user.id, proposalId, now);
  if (!data) notFound();
  return (
    <ProposalScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onAccept: acceptProposalAction.bind(null, proposalId),
        onFinishVerification: finishProposalVerificationAction.bind(null, proposalId),
        onDecline: declineProposalAction.bind(null, proposalId),
        onWithdraw: withdrawProposalAction.bind(null, proposalId),
      }}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/proposals/[proposalId]/page.tsx', ProposalPage);
