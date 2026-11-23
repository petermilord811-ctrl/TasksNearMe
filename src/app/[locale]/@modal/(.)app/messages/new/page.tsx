import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { routes } from '@/contracts/routes';
import { startDirectChatAction } from '@/modules/messaging/actions';
import { getNewDirectMessagePage, searchPeople } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { directChatTargetOf } from '@/shared/chat-links';
import { RouteDialogLoading } from '@/ui/components/layout/route-dialog-frame';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { appPageMetadata } from '@/i18n/metadata';
import { NewMessageFlow } from '../../../../(app)/app/_chat/new-message-flow';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('newMessage');
}

/**
 * New message in a dialog over the page it was opened from (2026-11-23, owner: "I hate to redirect to new pages
 * continually … if possible, use dialog"): Messages' New message and a profile's or a post's Message on phones (wide
 * screens open the chat window instead). The same steps as the page (src/app/[locale]/(app)/app/(flow)/messages/new):
 * find the person, write, and Send opens the conversation.
 */
function NewMessageDialogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RouteDialogLoading />}>
      <NewMessageDialog searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMessageDialog({ searchParams }: { searchParams: SearchParams }) {
  const [search, viewer] = await Promise.all([searchParams, getViewer()]);
  const to = directChatTargetOf(search);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.newMessage(to ?? undefined)));
  const now = await requestNow();
  const [found, initialSearch, t] = await Promise.all([
    to ? getNewDirectMessagePage(db, viewer.user.id, to, now) : Promise.resolve(null),
    searchPeople(db, viewer.user.id, '', now),
    getTranslations('directMessage.find'),
  ]);
  if (found?.kind === 'thread') redirect(routes.app.thread(found.threadId));
  if (to && !found && !('username' in to)) notFound();
  return <>
    <RouteDialogHeader title={t('title')} />
    <RouteDialogBody>
      <NewMessageFlow variant="dialog" {...(to ? { initial: { to, start: found } } : {})} initialSearch={initialSearch} onStart={startDirectChatAction} />
    </RouteDialogBody>
  </>;
}

export default withClientMessages('[locale]/@modal/(.)app/messages/new/page.tsx', NewMessageDialogPage);
