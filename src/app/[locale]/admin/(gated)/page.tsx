import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getAdminHome, staffActorOf } from '@/modules/support/staff';
import { getVerificationCounts } from '@/modules/verification/staff';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminHomeScreen } from '@/ui/screens/admin';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Queues', robots: { index: false } };

/** The staff queues (the layout already checked for staff who passed the two-step check). */
export default function AdminHomePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const [home, verifications] = await Promise.all([getAdminHome(db, staff, now), getVerificationCounts(db, now)]);
  return <AdminHomeScreen data={{ ...home, verifications }} now={now.toISOString()} />;
}
