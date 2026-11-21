import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { instantPayoutAction, openPayoutDashboardAction } from '@/modules/earnings/actions';
import { getEarningsPage } from '@/modules/earnings/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { EarningsScreen } from '@/ui/screens/money';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('earnings');
}

/** The helper's transfers and payouts. */
function EarningsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Earnings />
    </Suspense>
  );
}

async function Earnings() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.earnings()));
  const now = await requestNow();
  const data = await getEarningsPage(db, viewer.user.id, now);
  return <EarningsScreen data={data} now={now.toISOString()} handlers={{ onOpenPayoutDashboard: openPayoutDashboardAction, onInstantPayout: instantPayoutAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(main)/earnings/page.tsx', EarningsPage);
