import { redirect } from 'next/navigation';
import { switchLanguageAction } from '@/modules/accounts/language-actions';
import { Suspense } from 'react';
import { routes } from '@/contracts';
import { setMode, signOut } from '@/modules/accounts/actions';
import { checkPushSubscriptionAction, removePushSubscriptionAction } from '@/modules/notifications/actions';
import { remindApprovalsDue, remindUpcomingBookings } from '@/modules/bookings/reminders';
import { unreadMessageCount } from '@/modules/messaging/service';
import { acceptRequestFromWindowAction, askForOfferFromWindowAction, catchUpAction, deleteReplyAction, reactFromWindowAction, saveReplyAction, searchConversationAction, sendFromWindowAction, setConversationFlagFromWindowAction, shareTimesFromWindowAction, startDirectChatAction, suggestRepliesAction, translateMessageAction, translateMessagesAction, typingAction, uploadMessagePhoto } from '@/modules/messaging/actions';
import { attachGifAction, searchGifsAction } from '@/modules/messaging/gif-actions';
import { gifsOn } from '@/integrations/gifs';
import { bookingChatFromWindowAction } from '@/modules/bookings/chat-actions';
import { handOffToSupportAction, replyToHelpCaseAction, requestLiveChatAction, typingInHelpCaseAction } from '@/modules/assist/support-chat-actions';
import { blockUserAction, emailSupportTranscriptAction, rateSupportCaseAction, reportUserAction } from '@/modules/support/actions';
import { helpUnreadCount } from '@/modules/support/service';
import { assignUsername } from '@/modules/accounts/usernames';
import { sparksSummaryOf } from '@/modules/sparks/service';
import { neighborsNewsOf } from '@/modules/community/home';
import { communityViewerOf } from '@/modules/community/request-viewer';
import { shellNoticesFor } from '@/modules/markets/outage';
import { searchWithAi } from '@/modules/home/actions';
import { helperSetupReminder } from '@/modules/verification/reminder';
import { dispatchNotifications, unreadNotificationCount } from '@/modules/notifications/service';
import { aiWritingSetUp } from '@/integrations/ai';
import { getViewer, toSignedInViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { AppShell } from '@/ui/shells';
import { requestNow } from '@/platform/clock';
import { AppShellSkeleton } from '@/ui/shells/app-shell-skeleton';
import { ChatWindowController } from './_chat/chat-window-controller';
import { acceptInviteAction, cancelInviteAction, declineInviteAction } from '@/modules/invites/actions';
import { toggleSavedHelperAction } from '@/modules/reviews/actions';
import { PeekController } from '../../_peek/peek-controller';

/**
 * The signed-in shell: one, in `(app)/app/layout.tsx`, for both route groups, so a hop between (main) and (flow)
 * keeps it mounted (it was a shell per group, swapped on every hop, with the loading shell between). The group picks
 * the layout (`useAppShellLayout`): (flow) hides the phone tab bar for step-by-step and detail screens. Visitors
 * without a session go to sign-in, and so do accounts that haven't finished signing up (name, 18+ and terms, or a
 * private beta invite): `/sign-in` shows the step they stopped at.
 */
export function SignedInShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <ViewerShell>{children}</ViewerShell>
    </Suspense>
  );
}

async function ViewerShell({ children }: { children: React.ReactNode }) {
  // getViewer treats an account that hasn't finished signing up as signed out (security review SEC18).
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn(routes.app.home()));
  // The job runner does this every minute; doing it for the viewer too keeps pages current, and lets a
  // time-travel test (the test clock moves this request's "now") see its reminders and notifications.
  const now = await requestNow();
  await remindApprovalsDue(db, now, { posterUserId: viewer.user.id });
  await remindUpcomingBookings(db, now, { userId: viewer.user.id });
  await dispatchNotifications(db, now, 50);
  // `notices`: the outage switch of the person's market (completion plan 5.15), on every signed-in page.
  // The chat button counts unread messages and an unread reply from support in the Help conversation (2026-11-22).
  // `neighborsNews`: the dot on the Neighbors item (plan 10.19).
  // `username` and `sparks`: the account menu's @username and score (2026-11-22); someone new gets a username here.
  // `helperSetup`: the verified-helper reminder beside the search bar, for someone in helper mode (2026-11-23).
  const [unreadMessages, unreadNotifications, notices, unreadHelp, neighborsNews, username, sparks, helperSetup] = await Promise.all([
    unreadMessageCount(db, viewer.user.id),
    unreadNotificationCount(db, viewer.user.id),
    shellNoticesFor(db, viewer.user.id),
    helpUnreadCount(db, viewer.user.id),
    communityViewerOf(viewer.user).then((reader) => neighborsNewsOf(db, reader)),
    viewer.user.username ? Promise.resolve(viewer.user.username) : assignUsername(db, viewer.user.id),
    sparksSummaryOf(db, viewer.user.id),
    viewer.user.mode === 'helper' ? helperSetupReminder(db, viewer.user.id, now) : Promise.resolve(null),
  ]);
  // The person's own market clock for every client component below (completion plan 8.1); server components get it
  // from the request (getViewer set it), and a page about another market names that market's.
  return (
    <TimeZoneProvider timeZone={viewer.user.timeZone}>
      <AppShell
        viewer={{ ...toSignedInViewer(viewer.user), unreadMessages, unreadNotifications, ...(neighborsNews ? { neighborsNews } : {}), ...(username ? { username } : {}), sparks: sparks ?? { total: 0, bought: 0, level: 'newcomer' }, ...(helperSetup ? { helperSetup } : {}) }}
        notices={notices}
        handlers={{ onModeChange: setMode, onSignOut: signOut, onSwitchLanguage: switchLanguageAction, onCheckPushDevice: checkPushSubscriptionAction, onForgetPushDevice: removePushSubscriptionAction, ...(aiWritingSetUp() ? { onAskSearch: searchWithAi } : {}) }}
        // Messages: the chat button and window (2026-11-22). Server Actions only (unbound, called with the conversation's
        // or the case's id), never closures.
        chat={<ChatWindowController viewerId={viewer.user.id} unread={unreadMessages + unreadHelp} actions={{ send: sendFromWindowAction, react: reactFromWindowAction, typing: typingAction, upload: uploadMessagePhoto, saveReply: saveReplyAction, deleteReply: deleteReplyAction, report: reportUserAction, block: blockUserAction, handOff: handOffToSupportAction, reply: replyToHelpCaseAction, requestLive: requestLiveChatAction, typingInCase: typingInHelpCaseAction, startChat: startDirectChatAction, flag: setConversationFlagFromWindowAction, accept: acceptRequestFromWindowAction, searchThread: searchConversationAction, translate: translateMessageAction, suggest: suggestRepliesAction, acceptInvite: acceptInviteAction, declineInvite: declineInviteAction, cancelInvite: cancelInviteAction, askForOffer: askForOfferFromWindowAction, rateCase: rateSupportCaseAction, emailTranscript: emailSupportTranscriptAction, translateMany: translateMessagesAction, catchUp: catchUpAction, bookingAction: bookingChatFromWindowAction, shareTimes: shareTimesFromWindowAction, ...(gifsOn() ? { searchGifs: searchGifsAction, attachGif: attachGifAction } : {}) }} />}
      >
        {children}
      </AppShell>
      {/* Peeks (2026-11-23): profiles, help articles and policies in a sheet instead of leaving the page. */}
      <PeekController handlers={{ onToggleSaved: toggleSavedHelperAction }} />
    </TimeZoneProvider>
  );
}
