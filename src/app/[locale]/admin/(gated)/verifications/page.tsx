import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { staffActorOf } from '@/modules/support/staff';
import { getAdminVerificationsPage } from '@/modules/verification/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminVerificationsScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Verifications', robots: { index: false } };

/** Verification reviews: proofs of address, ID checks waiting on staff, background checks to adjudicate. */
export default function AdminVerificationsPage({ searchParams }: PageProps<'/[locale]/admin/verifications'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <Verifications searchParams={searchParams} />
    </Suspense>
  );
}

async function Verifications({ searchParams }: Pick<PageProps<'/[locale]/admin/verifications'>, 'searchParams'>) {
  const [params, viewer] = await Promise.all([searchParams, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const queue = typeof params.queue === 'string' ? params.queue : undefined;
  return <AdminVerificationsScreen data={await getAdminVerificationsPage(db, staff, queue, now)} now={now.toISOString()} />;
}
