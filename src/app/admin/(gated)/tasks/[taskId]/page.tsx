import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { staffActorOf } from '@/modules/support/staff';
import { getAdminTaskPage } from '@/modules/tasks/moderation';
import { moderateTaskAction } from '@/modules/tasks/moderation-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { AdminTaskScreen } from '@/ui/screens/admin';

export const metadata: Metadata = { title: 'Task', robots: { index: false } };

/** A task for staff: its reports, and moderation for trust and safety, leads and admins. */
export default function AdminTaskPage({ params }: PageProps<'/admin/tasks/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminTask params={params} />
    </Suspense>
  );
}

async function AdminTask({ params }: Pick<PageProps<'/admin/tasks/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = new Date();
  const data = await getAdminTaskPage(db, staff, taskId, now);
  if (!data) notFound();
  return <AdminTaskScreen data={data} now={now.toISOString()} handlers={{ onModerate: moderateTaskAction.bind(null, taskId) }} />;
}
