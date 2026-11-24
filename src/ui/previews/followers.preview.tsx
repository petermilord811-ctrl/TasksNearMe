import { routes, type AppShellHandlers, type BookingView, type FollowerHandlers, type FollowingHandlers, type PreviewEntry, type ThreadHandlers, type ThreadPageData } from '@/contracts';
import {
  deskHelperWithFollower, deskPosterNoFollowers, deskPosterWithFollower, deskThreadClientWithFollower, deskThreadFollowerView, deskThreadFollowing, deskThreadHelperWithFollower,
  fakeConversationHandlers, fakeHandler, fakeThreadHandlers, followedDeskBooking, followedDeskCompleted, followedDeskEnded, followedDeskOnTheWay, followersPanelEmpty, followersPanelFull,
  followersPanelOne, jordanShell, liaBookingsPageData, mayaShell, mayaInboxPageData,
} from '@/fixtures';
import type { FollowersDialogProps } from '@/ui/components/family/followers-dialog';
import { OpenFollowersDialog as OpenDialog } from './followers-examples';
import { FamilyNote } from '@/ui/components/family/family-note';
import { InboxList } from '@/ui/components/messaging/inbox-list';
import { BookingHubScreen } from '@/ui/screens/bookings/booking-hub-screen';
import { BookingsScreen } from '@/ui/screens/bookings/bookings-screen';
import { FollowedBookingScreen } from '@/ui/screens/bookings/followed-booking-screen';
import { ThreadContent } from '@/ui/screens/messages/thread-screen';
import { AppShell } from '@/ui/shells/app-shell';

/**
 * Family followers (2026-11-24): the client's "Add a family member" dialog in each state, the booking page's card for the
 * client and the helper, the conversation's note for each of the three, the follower's read-only conversation and
 * booking page, and "Bookings you follow".
 */

const group = 'Family followers';
const now = '2026-11-21T16:05:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const followerHandlers: FollowerHandlers = { onAdd: fakeHandler({ ok: true, code: 'saved' }), onRemove: fakeHandler({ ok: true, code: 'updated' }) };
const leaveHandlers: FollowingHandlers = { onLeave: fakeHandler({ ok: true, code: 'updated' }) };
const threadHandlers: ThreadHandlers = { ...fakeThreadHandlers, ...fakeConversationHandlers, followers: followerHandlers };


// Not fullscreen: the dialog renders in a portal, and the padded root is what the harness waits to see.
const dialog = (id: string, title: string, props: Omit<FollowersDialogProps, 'open' | 'onOpenChange' | 'handlers' | 'helperName'> & { handlers?: FollowerHandlers }): PreviewEntry => ({
  id: `followers/${id}`, group, title,
  render: () => <OpenDialog handlers={followerHandlers} helperName="Jordan" {...props} />,
});

const booking = (id: string, title: string, data: BookingView, helper = false): PreviewEntry => ({
  id: `followers/${id}`, group, title, layout: 'fullscreen',
  render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="flow">
    <BookingHubScreen data={data} handlers={{ onAction: fakeHandler({ ok: true, code: 'updated' }) }} followers={followerHandlers} now={now} />
  </AppShell>,
});

const thread = (id: string, title: string, data: ThreadPageData, helper = false): PreviewEntry => ({
  id: `followers/${id}`, group, title, layout: 'fullscreen',
  render: () => <AppShell viewer={helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(data.thread.id)} layout="flow"><ThreadContent data={data} handlers={threadHandlers} now={now} /></AppShell>,
});

const followed = (id: string, title: string, data: typeof followedDeskBooking): PreviewEntry => ({
  id: `followers/${id}`, group, title, layout: 'fullscreen',
  render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="flow"><FollowedBookingScreen data={data} handlers={leaveHandlers} now={now} /></AppShell>,
});

export const followersPreviews: PreviewEntry[] = [
  dialog('dialog-empty', 'Add a family member: nobody follows yet', { panel: followersPanelEmpty }),
  dialog('dialog-one', 'Add a family member: Lia follows', { panel: followersPanelOne }),
  dialog('dialog-full', 'At the limit: 2 follow, Remove to add someone else', { panel: followersPanelFull }),
  dialog('dialog-not-found', 'No account with that username or email', { panel: followersPanelOne, initialWho: 'someone@example.com', initialError: 'notFound' }),
  dialog('dialog-invalid', 'Not a username or an email', { panel: followersPanelEmpty, initialWho: 'a', initialError: 'invalid' }),
  dialog('dialog-not-allowed', 'That person can\'t follow (themself, the helper, blocked)', { panel: followersPanelEmpty, initialWho: '@jordan', initialError: 'notAllowed' }),
  dialog('dialog-rate-limited', 'Too many tries (rate limited)', { panel: followersPanelEmpty, initialResult: { ok: false, code: 'rate_limited', retryAt: '2026-11-21T16:15:00.000Z' } }),
  booking('booking-client-none', "Client's booking page: Family members card, nobody yet", deskPosterNoFollowers),
  booking('booking-client-one', "Client's booking page: Lia follows", deskPosterWithFollower),
  booking('booking-helper', "Helper's booking page: who follows", deskHelperWithFollower, true),
  { id: 'followers/note-helper', group, title: "Conversation note: the helper's view", render: () => <FamilyNote family={deskThreadHelperWithFollower.family} /> },
  { id: 'followers/note-client', group, title: "Conversation note: the client's view", render: () => <FamilyNote family={deskThreadClientWithFollower.family} /> },
  { id: 'followers/note-following', group, title: "Conversation note: the follower's view", render: () => <FamilyNote family={deskThreadFollowerView.family} /> },
  thread('thread-client', 'Client conversation: note, and "Add a family member" in ⋯', deskThreadClientWithFollower),
  thread('thread-helper', 'Helper conversation: "Maya\'s family member Lia follows this booking"', deskThreadHelperWithFollower, true),
  thread('thread-following', "Follower's conversation: read-only, no composer", deskThreadFollowerView),
  { id: 'followers/inbox-following', group, title: 'Messages: the followed conversation marked "Following"', render: () => <div className="max-w-md rounded-xl border"><InboxList threads={[deskThreadFollowing, ...mayaInboxPageData.threads]} now={now} /></div> },
  followed('followed-confirmed', "Follower's booking page: confirmed", followedDeskBooking),
  followed('followed-on-the-way', "Follower's booking page: Jordan on the way", followedDeskOnTheWay),
  followed('followed-completed', "Follower's booking page: done, following ends in 7 days", followedDeskCompleted),
  followed('followed-ended', "Follower's booking page: following ended", followedDeskEnded),
  {
    id: 'followers/bookings-list', group, title: 'Bookings: "Bookings you follow"', layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.bookings()} layout="flow"><BookingsScreen data={liaBookingsPageData} now={now} /></AppShell>,
  },
];
