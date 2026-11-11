import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { cancelTaskAction, posterOfferAction, taskOwnerAction } from '@/modules/offers/actions';
import { getTaskOwnerView } from '@/modules/offers/owner';
import { ownerDepsFor } from '@/modules/offers/server';
import { getViewer } from '@/platform/auth/viewer';
import { PageSkeleton } from '@/ui/components';
import { TaskManageScreen } from '@/ui/screens/tasks';

export const metadata: Metadata = { title: 'Your task' };

/** The poster's own task: offers, compare, cancel. Anyone else gets a 404. */
export default function ManageTaskPage({ params }: PageProps<'/app/tasks/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <ManageTask params={params} />
    </Suspense>
  );
}

async function ManageTask({ params }: Pick<PageProps<'/app/tasks/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') notFound();
  const deps = await ownerDepsFor(viewer.user.id);
  const now = new Date();
  const data = deps ? await getTaskOwnerView(deps, viewer.user.id, taskId, now) : null;
  if (!data) notFound();
  return (
    <TaskManageScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onOfferAction: posterOfferAction,
        onTaskAction: taskOwnerAction.bind(null, taskId),
        onCancelTask: cancelTaskAction.bind(null, taskId),
      }}
    />
  );
}
