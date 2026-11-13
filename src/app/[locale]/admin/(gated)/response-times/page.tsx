import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getResponseTimes } from '@/modules/support/response-times';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminResponseTimesScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Response times', robots: { index: false } };

/** Each queue against its response targets, what to pick up first, and who has the waiting cases. */
export default function AdminResponseTimesPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <ResponseTimes />
    </Suspense>
  );
}

async function ResponseTimes() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  return <AdminResponseTimesScreen data={await getResponseTimes(db, now)} now={now.toISOString()} />;
}
