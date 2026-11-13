import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminCases, parseAdminCaseFilters, staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminCasesScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Cases', robots: { index: false } };

/** Cases by queue, status and assignee (filters in the URL). */
export default function AdminCasesPage({ searchParams }: PageProps<'/[locale]/admin/cases'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminCases searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminCases({ searchParams }: Pick<PageProps<'/[locale]/admin/cases'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const data = await getAdminCases(db, staff, parseAdminCaseFilters(params), now);
  return <AdminCasesScreen data={data} now={now.toISOString()} />;
}
