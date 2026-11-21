import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { redeemRewardAction } from '@/modules/rewards/actions';
import { getRewardsPage } from '@/modules/rewards/service';
import { getViewer, toSignedInViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { RewardsScreen } from '@/ui/screens/rewards';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('rewards');
}

/** A helper's gift-card rewards (brought up to date with their bookings on each visit). */
function RewardsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Rewards />
    </Suspense>
  );
}

async function Rewards() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.rewards()));
  const now = await requestNow();
  const data = await getRewardsPage(db, { id: viewer.user.id, helperReady: toSignedInViewer(viewer.user).helperReady }, now);
  return <RewardsScreen data={data} now={now.toISOString()} handlers={{ onRedeem: redeemRewardAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/rewards/page.tsx', RewardsPage);
