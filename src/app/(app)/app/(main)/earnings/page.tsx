import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { openPayoutDashboardAction } from '@/modules/earnings/actions';
import { getEarningsPage } from '@/modules/earnings/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { EarningsScreen } from '@/ui/screens/money';

export const metadata: Metadata = { title: 'Earnings', robots: { index: false } };

/** The helper's transfers and payouts. */
export default function EarningsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Earnings />
    </Suspense>
  );
}

async function Earnings() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.earnings()));
  const now = new Date();
  const data = await getEarningsPage(db, viewer.user.id, now);
  return <EarningsScreen data={data} now={now.toISOString()} handlers={{ onOpenPayoutDashboard: openPayoutDashboardAction }} />;
}
