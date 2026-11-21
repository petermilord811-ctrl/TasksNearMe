import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { canSeeJobs, getAdminJobs } from '@/modules/jobs/admin';
import { JOBS } from '@/modules/jobs/runner';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { PageSkeleton } from '@/ui/components';
import { AdminJobsScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Background jobs', robots: { index: false } };

/** What this server's job runner did, for admins and finance (when things break, 2026-11-21). */
function AdminJobsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <AdminJobs />
    </Suspense>
  );
}

async function AdminJobs() {
  const viewer = await getViewer();
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff || !canSeeJobs(staff.roles)) notFound();
  const now = await requestNow();
  return <AdminJobsScreen data={getAdminJobs(JOBS.map((job) => job.name), now)} now={now.toISOString()} />;
}

export default withClientMessages('[locale]/admin/(gated)/jobs/page.tsx', AdminJobsPage);
