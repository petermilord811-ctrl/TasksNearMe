import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminPayments, parseAdminMoneyTab } from '@/modules/support/staff-payments';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminPaymentsScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Payments', robots: { index: false } };

/** Money in and out for staff: a tab (`tab`) and a search (`q`) in the URL. */
export default function AdminPaymentsPage({ searchParams }: PageProps<'/admin/payments'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminPayments searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminPayments({ searchParams }: Pick<PageProps<'/admin/payments'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
  const now = new Date();
  const data = await getAdminPayments(db, { tab: parseAdminMoneyTab(first(params.tab)), query: first(params.q) }, now);
  return <AdminPaymentsScreen data={data} now={now.toISOString()} />;
}
