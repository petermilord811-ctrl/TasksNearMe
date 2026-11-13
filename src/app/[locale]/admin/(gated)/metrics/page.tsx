import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminMetrics, parseMetricsDays } from '@/modules/analytics/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminMetricsScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Market metrics', robots: { index: false } };

/** The launch targets, the funnel, daily figures, liquidity and reward spend (B-067; the period in the URL). */
export default function AdminMetricsPage({ searchParams }: PageProps<'/[locale]/admin/metrics'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminMetrics searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminMetrics({ searchParams }: Pick<PageProps<'/[locale]/admin/metrics'>, 'searchParams'>) {
  const [params, viewer, now] = await Promise.all([searchParams, getViewer(), requestNow()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  return <AdminMetricsScreen data={await getAdminMetrics(db, staff, parseMetricsDays(params.days), now)} />;
}
