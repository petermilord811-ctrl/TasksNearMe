import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { supportAssistantForRequest } from '@/modules/assist/assistant-choice';
import { getHelpSummary } from '@/modules/assist/support-chat';
import { getInbox } from '@/modules/messaging/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { InboxScreen } from '@/ui/screens/messages';
import { requestNow } from '@/platform/clock';
import { InboxSkeleton } from '@/ui/screens/messages/inbox-skeleton';
import { appPageMetadata } from '@/i18n/metadata';
import { acceptMessageRequestAction, setConversationFlagAction } from '@/modules/messaging/actions';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('messages');
}

/** The viewer's conversations, latest activity first, under TasksNearMe Help. */
function MessagesPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.messages()));
  const now = await requestNow();
  // TasksNearMe Help sits pinned on top (2026-11-22).
  const [data, help] = await Promise.all([getInbox(db, viewer.user.id, now), getHelpSummary(db, viewer.user.id, await supportAssistantForRequest())]);
  return <InboxScreen data={data} now={now.toISOString()} help={help} handlers={{ onFlag: setConversationFlagAction, onAccept: acceptMessageRequestAction }} />;
}

// The list's filters and search run in the browser (completion plan 7.3): it needs its copy there.
export default withClientMessages('[locale]/(app)/app/(main)/messages/page.tsx', MessagesPage);
