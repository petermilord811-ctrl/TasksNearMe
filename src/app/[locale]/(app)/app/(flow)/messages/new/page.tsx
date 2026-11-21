import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { startDirectChatAction } from '@/modules/messaging/actions';
import { getNewDirectMessagePage } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { NewDirectMessageScreen } from '@/ui/screens/messages/new-direct-message-screen';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('newMessage');
}

/**
 * Start a direct conversation (2026-11-21): `?to=<userId>` (a community author's Message) or `?helper=<handle>` (a
 * helper's profile). When the two already have one, straight to it.
 */
function NewMessagePage({ searchParams }: PageProps<'/[locale]/app/messages/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewMessage searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMessage({ searchParams }: Pick<PageProps<'/[locale]/app/messages/new'>, 'searchParams'>) {
  const [{ to, helper }, viewer] = await Promise.all([searchParams, getViewer()]);
  const target = typeof helper === 'string' && helper ? { helper } : typeof to === 'string' && to ? { userId: to } : null;
  if (viewer.kind !== 'user') redirect(routes.signIn(target ? routes.app.newMessage(target) : routes.app.messages()));
  if (!target) notFound();
  const found = await getNewDirectMessagePage(db, viewer.user.id, target, await requestNow());
  if (!found) notFound();
  if (found.kind === 'thread') redirect(routes.app.thread(found.threadId));
  return <NewDirectMessageScreen data={found.data} handlers={{ onStart: startDirectChatAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/new/page.tsx', NewMessagePage);
