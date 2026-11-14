import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { decideRewardAction } from '@/modules/rewards/staff-actions';
import { getAdminRewards, parseRewardFilter } from '@/modules/rewards/staff';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminRewardsScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Rewards', robots: { index: false } };

/** The reward review queue (status filter in the URL). */
function AdminRewardsPage({ searchParams }: PageProps<'/[locale]/admin/rewards'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminRewards searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminRewards({ searchParams }: Pick<PageProps<'/[locale]/admin/rewards'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const data = await getAdminRewards(db, staff, parseRewardFilter(params.status));
  return <AdminRewardsScreen data={data} now={(await requestNow()).toISOString()} handlers={{ onDecide: decideRewardAction }} />;
}

export default withClientMessages('[locale]/admin/(gated)/rewards/page.tsx', AdminRewardsPage);
