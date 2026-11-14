import { withClientMessages } from '@/i18n/client-messages';
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
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Task', robots: { index: false } };

/** A task for staff: its reports, and moderation for trust and safety, leads and admins. */
function AdminTaskPage({ params }: PageProps<'/[locale]/admin/tasks/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <AdminTask params={params} />
    </Suspense>
  );
}

async function AdminTask({ params }: Pick<PageProps<'/[locale]/admin/tasks/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  const staff = viewer.kind === 'user' ? staffActorOf(viewer.user) : null;
  if (!staff) notFound();
  const now = await requestNow();
  const data = await getAdminTaskPage(db, staff, taskId, now);
  if (!data) notFound();
  return <AdminTaskScreen data={data} now={now.toISOString()} handlers={{ onModerate: moderateTaskAction.bind(null, taskId) }} />;
}

export default withClientMessages('[locale]/admin/(gated)/tasks/[taskId]/page.tsx', AdminTaskPage);
