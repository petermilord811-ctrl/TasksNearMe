import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { startDirectChatAction } from '@/modules/messaging/actions';
import { findUserIdByUsername } from '@/modules/accounts/usernames';
import { getFindPersonPage, getNewDirectMessagePage } from '@/modules/messaging/direct';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { PageSkeleton } from '@/ui/components';
import { FindPersonScreen } from '@/ui/screens/messages/find-person-screen';
import { NewDirectMessageScreen } from '@/ui/screens/messages/new-direct-message-screen';
import { appPageMetadata } from '@/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('newMessage');
}

/**
 * Start a direct conversation (2026-11-21): `?to=<userId>` (a community author's Message), `?helper=<handle>` (a
 * helper's profile) or `?u=<username>` (2026-11-22: "New message"; with no one named, the page asks for an @username).
 * When the two already have one, straight to it.
 */
function NewMessagePage({ searchParams }: PageProps<'/[locale]/app/messages/new'>) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewMessage searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMessage({ searchParams }: Pick<PageProps<'/[locale]/app/messages/new'>, 'searchParams'>) {
  const [{ to, helper, u }, viewer] = await Promise.all([searchParams, getViewer()]);
  const username = typeof u === 'string' ? u.trim() : '';
  const named = typeof helper === 'string' && helper ? { helper } : typeof to === 'string' && to ? { userId: to } : username ? { username } : null;
  if (viewer.kind !== 'user') redirect(routes.signIn(named ? routes.app.newMessage(named) : routes.app.newMessage()));
  const now = await requestNow();
  // By @username (2026-11-22): the box asks for one, and says so when it belongs to nobody reachable.
  const byUsername = username && !('helper' in (named ?? {})) && !('userId' in (named ?? {})) ? await findUserIdByUsername(db, username) : null;
  const target = named && 'username' in named ? (byUsername ? { userId: byUsername } : null) : named;
  if (!target) return <FindPersonScreen data={await getFindPersonPage(db, viewer.user.id, { text: username, notFound: Boolean(username) }, now)} />;
  const found = await getNewDirectMessagePage(db, viewer.user.id, target, now);
  if (!found) notFound();
  if (found.kind === 'thread') redirect(routes.app.thread(found.threadId));
  return <NewDirectMessageScreen data={found.data} handlers={{ onStart: startDirectChatAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/new/page.tsx', NewMessagePage);
