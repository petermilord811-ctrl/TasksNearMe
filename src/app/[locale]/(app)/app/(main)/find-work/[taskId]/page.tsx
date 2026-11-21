import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { draftOfferMessageAction } from '@/modules/assist/actions';
import { getHelperTaskView } from '@/modules/offers/helper';
import { helperOfferActionHandler, quoteOfferAction, reviseOfferAction, submitOfferAction } from '@/modules/offers/helper-actions';
import { answerTaskQuestionAction, askTaskQuestionAction, deleteTaskQuestionAction, moderateTaskQuestionAction, pinTaskQuestionAction } from '@/modules/questions/actions';
import { getTaskQuestions } from '@/modules/questions/service';
import { communityPostOfTask } from '@/modules/community/service';
import { TaskDiscussionLink } from '@/ui/components/community/task-discussion-link';
import { staffActorOf } from '@/modules/support/staff';
import { TaskQuestions } from '@/ui/components/questions/task-questions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HelperTaskScreen } from '@/ui/screens/work';
import { requestNow } from '@/platform/clock';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('findWorkTask');
}

/** A task from the helper's side: the offer form, the helper's own offer, or why they can't offer. */
function HelperTaskPage({ params }: PageProps<'/[locale]/app/find-work/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <HelperTask params={params} />
    </Suspense>
  );
}

async function HelperTask({ params }: Pick<PageProps<'/[locale]/app/find-work/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.findWorkTask(taskId)));
  const now = await requestNow();
  const [data, botCheck, questions, discussion] = await Promise.all([getHelperTaskView(db, viewer.user.id, taskId, now), botCheckForPage(), getTaskQuestions(db, { id: viewer.user.id, staff: staffActorOf(viewer.user) }, taskId, now), communityPostOfTask(db, taskId)]);
  if (!data) notFound();
  return (
    <div className="space-y-6">
    <HelperTaskScreen
      data={botCheck ? { ...data, botCheck } : data}
      now={now.toISOString()}
      handlers={{
        onQuote: quoteOfferAction,
        onDraftOfferMessage: draftOfferMessageAction.bind(null, taskId),
        onSubmitOffer: submitOfferAction.bind(null, taskId),
        onReviseOffer: reviseOfferAction.bind(null, taskId),
        onOfferAction: helperOfferActionHandler,
      }}
    />
    {/* The neighborhood post it came from (plan 9.10), then questions before offering (7.9). */}
    {discussion && <TaskDiscussionLink discussion={discussion} />}
    {questions && <TaskQuestions data={questions} now={now.toISOString()} handlers={{
        onAsk: askTaskQuestionAction.bind(null, taskId),
        onAnswer: answerTaskQuestionAction.bind(null, taskId),
        onPin: pinTaskQuestionAction.bind(null, taskId),
        onDelete: deleteTaskQuestionAction,
        ...(staffActorOf(viewer.user) ? { onModerate: moderateTaskQuestionAction } : {}),
      }} />}
    </div>
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/find-work/[taskId]/page.tsx', HelperTaskPage);
