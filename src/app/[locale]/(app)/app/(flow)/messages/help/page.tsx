import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { appPageMetadata } from '@/i18n/metadata';
import { supportAssistantForRequest } from '@/modules/assist/assistant-choice';
import { getHelpChat } from '@/modules/assist/support-chat';
import { handOffToSupportAction, replyToHelpCaseAction, requestLiveChatAction, typingInHelpCaseAction } from '@/modules/assist/support-chat-actions';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { STAFF_SUPPORT_CHANNEL } from '@/platform/realtime/hub';
import { realtimeHub } from '@/platform/realtime/listener';
import { ThreadSkeleton } from '@/ui/screens/messages/thread-skeleton';
import { HelpChatPage } from '../../../_chat/help-chat-page';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('helpChat');
}

/**
 * TasksNearMe Help on its own page (2026-11-22): the support assistant, or the open case from it with support's replies.
 * Opening it reads that case (as its Support page does).
 */
function HelpPage() {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <Help />
    </Suspense>
  );
}

async function Help() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.helpChat()));
  const now = await requestNow();
  const data = await getHelpChat(db, viewer.user.id, now, { assistant: await supportAssistantForRequest(), markRead: true, agentsOnline: realtimeHub().count(STAFF_SUPPORT_CHANNEL) });
  if (!data) notFound();
  return <HelpChatPage viewerId={viewer.user.id} data={data} now={now.toISOString()} actions={{ handOff: handOffToSupportAction, reply: replyToHelpCaseAction, requestLive: requestLiveChatAction, typing: typingInHelpCaseAction }} />;
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/help/page.tsx', HelpPage);
