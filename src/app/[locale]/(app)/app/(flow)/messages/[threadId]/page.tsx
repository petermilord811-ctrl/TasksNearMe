import { withClientMessages } from '@/i18n/client-messages';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { acceptMessageRequestAction, askForOfferAction, catchUpAction, deleteReplyAction, reactToMessageAction, saveReplyAction, searchConversationAction, sendMessageAction, setConversationFlagAction, shareTimesAction, suggestRepliesAction, translateMessageAction, translateMessagesAction, typingAction, uploadMessagePhoto } from '@/modules/messaging/actions';
import { bookingChatAction } from '@/modules/bookings/chat-actions';
import { supportAssistantForRequest } from '@/modules/assist/assistant-choice';
import { attachGifAction, searchGifsAction } from '@/modules/messaging/gif-actions';
import { gifsOn } from '@/integrations/gifs';
import { getHelpSummary } from '@/modules/assist/support-chat';
import { getInbox, getThreadPage } from '@/modules/messaging/service';
import { blockUserAction, reportUserAction } from '@/modules/support/actions';
import { getReportSubject } from '@/modules/support/service';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { ThreadContent, ThreadPanes } from '@/ui/screens/messages';
import { requestNow } from '@/platform/clock';
import { ThreadSkeleton } from '@/ui/screens/messages/thread-skeleton';
import { appPageMetadata } from '@/i18n/metadata';
import { acceptInviteAction, cancelInviteAction, declineInviteAction } from '@/modules/invites/actions';

export async function generateMetadata(): Promise<Metadata> {
  return appPageMetadata('conversation');
}

/**
 * One conversation for its two people (anyone else: not found). Opening it marks it read. `?from=` ("Load earlier
 * messages", sweep MN11) shows it from an earlier message on. On wide screens the
 * conversations sit beside it, and they're rendered apart from it: the list isn't inside the conversation's Suspense
 * boundary, so opening one from Messages keeps a list on screen the whole way (the old one until the new one is in)
 * and only the conversation's pane shows its skeleton while it loads.
 */
function ThreadPage({ params, searchParams }: PageProps<'/[locale]/app/messages/[threadId]'>) {
  return <Conversations params={params} searchParams={searchParams} />;
}

async function Conversations({ params, searchParams }: Pick<PageProps<'/[locale]/app/messages/[threadId]'>, 'params' | 'searchParams'>) {
  const [{ threadId }, viewer] = await Promise.all([params, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = await requestNow();
  // The open conversation reads as read here: it's marked read as it opens, beside this list.
  const [inbox, help] = await Promise.all([getInbox(db, viewer.user.id, now), getHelpSummary(db, viewer.user.id, await supportAssistantForRequest())]);
  const threads = inbox.threads.map((thread) => (thread.id === threadId ? { ...thread, unreadCount: 0 } : thread));
  const beside = threads.length > 0;
  const conversation = (
    <Suspense fallback={<ThreadSkeleton pane={beside} />}>
      <Thread params={params} searchParams={searchParams} wide={beside} />
    </Suspense>
  );
  return beside ? <ThreadPanes inbox={threads} currentId={threadId} now={now.toISOString()} help={help} listHandlers={{ onFlag: setConversationFlagAction, onAccept: acceptMessageRequestAction }}>{conversation}</ThreadPanes> : conversation;
}

async function Thread({ params, searchParams, wide }: Pick<PageProps<'/[locale]/app/messages/[threadId]'>, 'params' | 'searchParams'> & { wide: boolean }) {
  const [{ threadId }, { from, focus }, viewer] = await Promise.all([params, searchParams, getViewer()]);
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.thread(threadId)));
  const now = await requestNow();
  const [data, subject] = await Promise.all([getThreadPage(db, viewer.user.id, threadId, now, typeof from === 'string' ? { from } : {}), getReportSubject(db, viewer.user.id, threadId)]);
  if (!data) notFound();
  return (
    <ThreadContent
      wide={wide}
      data={data}
      now={now.toISOString()}
      {...(typeof focus === 'string' ? { focusId: focus } : {})}
      handlers={{
        onSend: sendMessageAction.bind(null, threadId),
        onUploadPhoto: uploadMessagePhoto,
        onTyping: typingAction.bind(null, threadId),
        onReact: reactToMessageAction.bind(null, threadId),
        onSaveReply: saveReplyAction,
        onDeleteReply: deleteReplyAction,
        // The viewer's own list, a message request, and the conversation's search (2026-11-23).
        onFlag: setConversationFlagAction.bind(null, threadId),
        onAccept: acceptMessageRequestAction.bind(null, threadId),
        onSearch: searchConversationAction.bind(null, threadId),
        onTranslate: translateMessageAction.bind(null, threadId),
        onSuggest: suggestRepliesAction.bind(null, threadId),
        // The whole conversation translated, and "Catch me up" (2026-11-24).
        onTranslateMany: translateMessagesAction.bind(null, threadId),
        onCatchUp: catchUpAction.bind(null, threadId),
        requestCards: { onAccept: acceptInviteAction, onDecline: declineInviteAction, onCancel: cancelInviteAction },
        onAskForOffer: askForOfferAction.bind(null, threadId),
        // GIFs (2026-11-24): only with a KLIPY key, or the samples outside production.
        ...(gifsOn() ? { onSearchGifs: searchGifsAction, onAttachGif: attachGifAction } : {}),
        // A booking's day-of chips and Share times (2026-11-24).
        onBookingAction: bookingChatAction.bind(null, threadId),
        onShareTimes: shareTimesAction.bind(null, threadId),
      }}
      {...(subject ? { safety: { subject, handlers: { onReport: reportUserAction.bind(null, threadId), onBlock: blockUserAction.bind(null, threadId) } } } : {})}
    />
  );
}

export default withClientMessages('[locale]/(app)/app/(flow)/messages/[threadId]/page.tsx', ThreadPage);
