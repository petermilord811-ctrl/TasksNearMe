import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { startDirectChatAction } from '@/modules/messaging/actions';
import { getNewDirectMessagePage, searchPeople } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { directChatTargetOf } from '@/shared/chat-links';
import { PageSkeleton } from '@/ui/components';
import { appPageMetadata } from '@/i18n/metadata';
import { NewMessageFlow } from '../../../_chat/new-message-flow';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('newMessage');
}

/**
 * Start a direct conversation (2026-11-21): `?to=<userId>` (a community author's Message), `?helper=<handle>` (a
 * helper's profile) or `?u=<username>`; with no one named, the page asks for an @username, with suggestions as it's
 * typed, and shows the first message's form in place (2026-11-23: no trip to the server per name). When the two
 * already have a conversation, straight to it. Reached from inside the site on a phone, it opens as a dialog over the
 * page instead (src/app/[locale]/@modal/(.)app/messages/new); on wide screens the chat window takes it.
 */
function NewMessagePage({ searchParams }: PageProps<'/[locale]/app/messages/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewMessage searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMessage({ searchParams }: Pick<PageProps<'/[locale]/app/messages/new'>, 'searchParams'>) {
  const [search, viewer] = await Promise.all([searchParams, getViewer()]);
  const to = directChatTargetOf(search);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newMessage(to ?? undefined)));
  const now = await requestNow();
  const [found, initialSearch] = await Promise.all([to ? getNewDirectMessagePage(db, viewer.user.id, to, now) : Promise.resolve(null), searchPeople(db, viewer.user.id, '', now)]);
  if (found?.kind === 'thread') redirect(routes.app.thread(found.threadId));
  // An id or a handle that names nobody is a broken link; an @username that does is a typo the find step points out.
  if (to && !found && !('username' in to)) notFound();
  return <NewMessageFlow variant="page" {...(to ? { initial: { to, start: found } } : {})} initialSearch={initialSearch} onStart={startDirectChatAction} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/new/page.tsx', NewMessagePage);
