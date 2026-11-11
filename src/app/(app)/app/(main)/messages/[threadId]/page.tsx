import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { sendMessageAction, uploadMessagePhoto } from '@/modules/messaging/actions';
import { getThreadPage } from '@/modules/messaging/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { ThreadScreen } from '@/ui/screens/messages';

export const metadata: Metadata = { title: 'Conversation', robots: { index: false } };

/** One conversation for its two people (anyone else: not found). Opening it marks it read. */
export default function ThreadPage({ params }: PageProps<'/app/messages/[threadId]'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Thread params={params} />
    </Suspense>
  );
}

async function Thread({ params }: Pick<PageProps<'/app/messages/[threadId]'>, 'params'>) {
  const [{ threadId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = new Date();
  const data = await getThreadPage(db, viewer.user.id, threadId, now);
  if (!data) notFound();
  return <ThreadScreen data={data} now={now.toISOString()} handlers={{ onSend: sendMessageAction.bind(null, threadId), onUploadPhoto: uploadMessagePhoto }} />;
}
