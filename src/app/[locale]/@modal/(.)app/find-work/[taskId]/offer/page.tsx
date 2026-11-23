import { withClientMessages } from '@/i18n/client-messages';
import { appPageMetadata } from '@/i18n/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { botCheckForPage } from '@/modules/accounts/bot-check';
import { draftOfferMessageAction } from '@/modules/assist/actions';
import { communityPostOfTask } from '@/modules/community/service';
import { getHelperTaskView } from '@/modules/offers/helper';
import { helperOfferActionHandler, quoteOfferAction, reviseOfferAction, submitOfferAction } from '@/modules/offers/helper-actions';
import { answerTaskQuestionAction, askTaskQuestionAction, deleteTaskQuestionAction, moderateTaskQuestionAction, pinTaskQuestionAction } from '@/modules/questions/actions';
import { getTaskQuestions } from '@/modules/questions/service';
import { staffActorOf } from '@/modules/support/staff';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { TaskDiscussionLink } from '@/ui/components/community/task-discussion-link';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { TaskQuestions } from '@/ui/components/questions/task-questions';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { HelperTaskDialogScreen } from '@/ui/screens/work';

type Params = Promise<{ taskId: string }>;

/** The full page's title while the dialog is open (the tab names what's on screen). */
export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('findWorkTask');
}

/**
 * A task from the helper's side, with the offer form, over the public task page its "Make an offer" was pressed on
 * (2026-11-23, owner: "I hate to redirect to new pages continually"), at its own address (`routes.app.findWorkOffer`).
 * The task's page stays a page: signing back in returns to the words of an offer being written there (J-N2), and a
 * report opens as a dialog over it. The offer form keeps its bot check here, as on the page.
 */
function HelperTaskDialogPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <HelperTask params={params} />
    </Suspense>
  );
}

async function HelperTask({ params }: { params: Params }) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.findWorkTask(taskId)));
  const now = await requestNow();
  const staff = staffActorOf(viewer.user);
  const [data, botCheck, questions, discussion] = await Promise.all([getHelperTaskView(db, viewer.user.id, taskId, now), botCheckForPage(), getTaskQuestions(db, { id: viewer.user.id, staff }, taskId, now), communityPostOfTask(db, taskId)]);
  if (!data) notFound();
  // The signed-in shell's clock, as the full page has it (the dialog opens outside the shell).
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <HelperTaskDialogScreen
        data={botCheck ? { ...data, botCheck } : data}
        now={now.toISOString()}
        handlers={{
          onQuote: quoteOfferAction,
          onDraftOfferMessage: draftOfferMessageAction.bind(null, taskId),
          onSubmitOffer: submitOfferAction.bind(null, taskId),
          onReviseOffer: reviseOfferAction.bind(null, taskId),
          onOfferAction: helperOfferActionHandler,
        }}
      >
        {/* The neighborhood post it came from (plan 9.10), then questions before offering (7.9), as on the page. */}
        {discussion && <TaskDiscussionLink discussion={discussion} />}
        {questions && <TaskQuestions data={questions} now={now.toISOString()} handlers={{
          onAsk: askTaskQuestionAction.bind(null, taskId),
          onAnswer: answerTaskQuestionAction.bind(null, taskId),
          onPin: pinTaskQuestionAction.bind(null, taskId),
          onDelete: deleteTaskQuestionAction,
          ...(staff ? { onModerate: moderateTaskQuestionAction } : {}),
        }} />}
      </HelperTaskDialogScreen>
    </TimeZoneProvider>
  );
}

export default withClientMessages('[locale]/@modal/(.)app/find-work/[taskId]/offer/page.tsx', HelperTaskDialogPage);
