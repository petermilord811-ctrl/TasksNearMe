import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { bookingDeps } from '@/modules/bookings/server';
import { inviteHandlers } from '@/modules/invites/handlers';
import { invitesForTask } from '@/modules/invites/service';
import { cancelTaskAction, posterOfferAction, taskOwnerAction } from '@/modules/offers/actions';
import { getTaskOwnerView } from '@/modules/offers/owner';
import { ownerDepsFor } from '@/modules/offers/server';
import { answerTaskQuestionAction, askTaskQuestionAction, deleteTaskQuestionAction, moderateTaskQuestionAction, pinTaskQuestionAction } from '@/modules/questions/actions';
import { getTaskQuestions } from '@/modules/questions/service';
import { communityPostOfTask } from '@/modules/community/service';
import { TaskDiscussionLink } from '@/ui/components/community/task-discussion-link';
import { staffActorOf } from '@/modules/support/staff';
import { TaskQuestions } from '@/ui/components/questions/task-questions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { savePushSubscriptionAction } from '@/modules/notifications/actions';
import { TaskManageScreen } from '@/ui/screens/tasks';
import { requestNow } from '@/platform/clock';
import { TaskManageSkeleton } from '@/ui/screens/tasks/task-detail-skeletons';

export const metadata: Metadata = { title: 'Your task' };

/** The poster's own task: offers, invites, compare, cancel. Anyone else gets a 404. */
function ManageTaskPage({ params }: PageProps<'/[locale]/app/tasks/[taskId]'>) {
  return (
    <Suspense fallback={<TaskManageSkeleton />}>
      <ManageTask params={params} />
    </Suspense>
  );
}

async function ManageTask({ params }: Pick<PageProps<'/[locale]/app/tasks/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') notFound();
  const deps = await ownerDepsFor(viewer.user.id);
  const now = await requestNow();
  const [data, invites] = deps
    ? await Promise.all([getTaskOwnerView(deps, viewer.user.id, taskId, now), invitesForTask(db, bookingDeps()?.payments ?? null, viewer.user.id, taskId, now)])
    : [null, []];
  if (!data) notFound();
  const [questions, discussion] = await Promise.all([getTaskQuestions(db, { id: viewer.user.id, staff: staffActorOf(viewer.user) }, taskId), communityPostOfTask(db, taskId)]);
  return (
    <div className="space-y-6">
    <TaskManageScreen
      data={{ ...data, invites }}
      now={now.toISOString()}
      inviteHandlers={inviteHandlers}
      handlers={{
        onOfferAction: posterOfferAction,
        onTaskAction: taskOwnerAction.bind(null, taskId),
        onCancelTask: cancelTaskAction.bind(null, taskId),
        onSavePushSubscription: savePushSubscriptionAction,
      }}
    />
    {/* The neighborhood post it came from (plan 9.10), then questions from helpers (7.9), answered and pinned here. */}
    {discussion && <TaskDiscussionLink discussion={discussion} />}
    {questions && <TaskQuestions wide data={questions} now={now.toISOString()} handlers={{
        onAsk: askTaskQuestionAction.bind(null, taskId),
        onAnswer: answerTaskQuestionAction.bind(null, taskId),
        onPin: pinTaskQuestionAction.bind(null, taskId),
        onDelete: deleteTaskQuestionAction,
        ...(staffActorOf(viewer.user) ? { onModerate: moderateTaskQuestionAction } : {}),
      }} />}
    </div>
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/tasks/[taskId]/page.tsx', ManageTaskPage);
