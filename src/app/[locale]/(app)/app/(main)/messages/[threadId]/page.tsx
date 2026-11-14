import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { sendMessageAction, typingAction, uploadMessagePhoto } from '@/modules/messaging/actions';
import { getInbox, getThreadPage } from '@/modules/messaging/service';
import { blockUserAction, reportUserAction } from '@/modules/support/actions';
import { getReportSubject } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ThreadScreen } from '@/ui/screens/messages';
import { requestNow } from '@/platform/clock';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false } };

/** One conversation for its two people (anyone else: not found). Opening it marks it read. */
function ThreadPage({ params }: PageProps<'/[locale]/app/messages/[threadId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Thread params={params} />
    </Suspense>
  );
}

async function Thread({ params }: Pick<PageProps<'/[locale]/app/messages/[threadId]'>, 'params'>) {
  const [{ threadId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = await requestNow();
  // The conversation first (opening it marks it read), then the list beside it shows it read too.
  const [data, subject] = await Promise.all([getThreadPage(db, viewer.user.id, threadId, now), getReportSubject(db, viewer.user.id, threadId)]);
  const inbox = data ? await getInbox(db, viewer.user.id, now) : null;
  if (!data) notFound();
  return (
    <ThreadScreen
      data={data}
      now={now.toISOString()}
      inbox={inbox?.threads}
      handlers={{ onSend: sendMessageAction.bind(null, threadId), onUploadPhoto: uploadMessagePhoto, onTyping: typingAction.bind(null, threadId) }}
      {...(subject ? { safety: { subject, handlers: { onReport: reportUserAction.bind(null, threadId), onBlock: blockUserAction.bind(null, threadId) } } } : {})}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(main)/messages/[threadId]/page.tsx', ThreadPage);
