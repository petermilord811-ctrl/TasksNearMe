import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { deleteReplyAction, reactToMessageAction, saveReplyAction, sendMessageAction, typingAction, uploadMessagePhoto } from '@/modules/messaging/actions';
import { getInbox, getThreadPage } from '@/modules/messaging/service';
import { blockUserAction, reportUserAction } from '@/modules/support/actions';
import { getReportSubject } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { ThreadContent, ThreadPanes } from '@/ui/screens/messages';
import { requestNow } from '@/platform/clock';
import { ThreadSkeleton } from '@/ui/screens/messages/thread-skeleton';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false } };

/**
 * One conversation for its two people (anyone else: not found). Opening it marks it read. On wide screens the
 * conversations sit beside it, and they're rendered apart from it: the list isn't inside the conversation's Suspense
 * boundary, so opening one from Messages keeps a list on screen the whole way (the old one until the new one is in)
 * and only the conversation's pane shows its skeleton while it loads.
 */
function ThreadPage({ params }: PageProps<'/[locale]/app/messages/[threadId]'>) {
  return <Conversations params={params} />;
}

async function Conversations({ params }: Pick<PageProps<'/[locale]/app/messages/[threadId]'>, 'params'>) {
  const [{ threadId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = await requestNow();
  // The open conversation reads as read here: it's marked read as it opens, beside this list.
  const threads = (await getInbox(db, viewer.user.id, now)).threads.map((thread) => (thread.id === threadId ? { ...thread, unreadCount: 0 } : thread));
  const beside = threads.length > 0;
  const conversation = (
    <Suspense fallback={<ThreadSkeleton pane={beside} />}>
      <Thread params={params} wide={beside} />
    </Suspense>
  );
  return beside ? <ThreadPanes inbox={threads} currentId={threadId} now={now.toISOString()}>{conversation}</ThreadPanes> : conversation;
}

async function Thread({ params, wide }: Pick<PageProps<'/[locale]/app/messages/[threadId]'>, 'params'> & { wide: boolean }) {
  const [{ threadId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = await requestNow();
  const [data, subject] = await Promise.all([getThreadPage(db, viewer.user.id, threadId, now), getReportSubject(db, viewer.user.id, threadId)]);
  if (!data) notFound();
  return (
    <ThreadContent
      wide={wide}
      data={data}
      now={now.toISOString()}
      handlers={{ onSend: sendMessageAction.bind(null, threadId), onUploadPhoto: uploadMessagePhoto, onTyping: typingAction.bind(null, threadId), onReact: reactToMessageAction.bind(null, threadId), onSaveReply: saveReplyAction, onDeleteReply: deleteReplyAction }}
      {...(subject ? { safety: { subject, handlers: { onReport: reportUserAction.bind(null, threadId), onBlock: blockUserAction.bind(null, threadId) } } } : {})}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/[threadId]/page.tsx', ThreadPage);
