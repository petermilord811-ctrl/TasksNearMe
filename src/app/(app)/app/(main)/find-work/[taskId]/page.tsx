import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { getHelperTaskView } from '@/modules/offers/helper';
import { helperOfferActionHandler, quoteOfferAction, reviseOfferAction, submitOfferAction } from '@/modules/offers/helper-actions';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { HelperTaskScreen } from '@/ui/screens/work';

export const metadata: Metadata = { title: 'Task', robots: { index: false } };

/** A task from the helper's side: the offer form, the helper's own offer, or why they can't offer. */
export default function HelperTaskPage({ params }: PageProps<'/app/find-work/[taskId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <HelperTask params={params} />
    </Suspense>
  );
}

async function HelperTask({ params }: Pick<PageProps<'/app/find-work/[taskId]'>, 'params'>) {
  const [{ taskId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.findWorkTask(taskId)));
  const now = new Date();
  const data = await getHelperTaskView(db, viewer.user.id, taskId, now);
  if (!data) notFound();
  return (
    <HelperTaskScreen
      data={data}
      now={now.toISOString()}
      handlers={{
        onQuote: quoteOfferAction,
        onSubmitOffer: submitOfferAction.bind(null, taskId),
        onReviseOffer: reviseOfferAction.bind(null, taskId),
        onOfferAction: helperOfferActionHandler,
      }}
    />
  );
}
