import type { BookingFollowersPanel, BookingsPageData, BookingView, FollowedBookingRow, FollowedBookingView, FollowedByNotice, FollowerPerson, ThreadPageData, ThreadSummary } from '@/contracts';
import { BOOKING_FOLLOWERS_MAX } from '@/contracts';
import { deskBookingHelperConfirmed, deskBookingPosterConfirmed } from './bookings';
import { deskBookingThread, deskBookingThreadPageData } from './messaging';
import { jordan, maya } from './people';
import { DESK_TIMES } from './timeline';

/**
 * Family followers (2026-11-24): Maya lets her daughter Lia follow the desk booking with Jordan. Every state the
 * screens show: the client's panel (none, one, at the limit, the booking over), the helper's note, the follower's
 * read-only booking page and conversation, and "Bookings you follow".
 */

export const lia: FollowerPerson = { id: 'usr_lia', displayName: 'Lia R.', initials: 'LR', since: '2026-11-18T14:00:00.000Z' };
export const tom: FollowerPerson = { id: 'usr_tom', displayName: 'Tom R.', initials: 'TR', since: '2026-11-19T09:30:00.000Z' };

export const followersPanelEmpty: BookingFollowersPanel = { bookingId: 'bkg_desk', followers: [], max: BOOKING_FOLLOWERS_MAX, canAdd: true };
export const followersPanelOne: BookingFollowersPanel = { ...followersPanelEmpty, followers: [lia] };
export const followersPanelFull: BookingFollowersPanel = { ...followersPanelEmpty, followers: [lia, tom], canAdd: false, addBlockedReason: 'limit' };

export const liaFollowsNotice: FollowedByNotice = { clientName: 'Maya R.', names: [lia.displayName] };
export const twoFollowNotice: FollowedByNotice = { clientName: 'Maya R.', names: [lia.displayName, tom.displayName] };

/** Maya's booking page with Lia following, and with nobody yet. */
export const deskPosterWithFollower: BookingView = { ...deskBookingPosterConfirmed, family: { manage: followersPanelOne, followedBy: liaFollowsNotice } };
export const deskPosterNoFollowers: BookingView = { ...deskBookingPosterConfirmed, family: { manage: followersPanelEmpty } };
/** Jordan's booking page: he always sees who follows. */
export const deskHelperWithFollower: BookingView = { ...deskBookingHelperConfirmed, family: { followedBy: liaFollowsNotice } };

const followerAddedLine = { id: 'msg_follow', sender: 'system' as const, kind: 'status' as const, segments: [], attachments: [], event: { type: 'follower_added' as const, params: { name: lia.displayName } }, createdAt: lia.since };

/** Maya's conversation with Lia following: "Add a family member" in the ⋯ menu, and the note on top. */
export const deskThreadClientWithFollower: ThreadPageData = {
  ...deskBookingThreadPageData,
  messages: [...deskBookingThreadPageData.messages.slice(0, 3), followerAddedLine, ...deskBookingThreadPageData.messages.slice(3)],
  family: { manage: followersPanelOne, followedBy: liaFollowsNotice },
};

/** Jordan's conversation: "Maya's family member Lia follows this booking". */
export const deskThreadHelperWithFollower: ThreadPageData = {
  ...deskBookingThreadPageData,
  thread: { ...deskBookingThread, otherParty: maya },
  messages: deskBookingThreadPageData.messages.map((message) => ({ ...message, sender: message.sender === 'me' ? 'them' : message.sender === 'them' ? 'me' : message.sender })),
  family: { followedBy: liaFollowsNotice },
};

/** Lia's inbox row: the desk conversation, marked "Following". */
export const deskThreadFollowing: ThreadSummary = { ...deskBookingThread, unreadCount: 0, following: true };

/** Lia reads the conversation as Maya sees it: read-only, no composer, no menus of their own. */
export const deskThreadFollowerView: ThreadPageData = {
  thread: deskThreadFollowing,
  messages: [...deskBookingThreadPageData.messages.slice(0, 3), followerAddedLine, ...deskBookingThreadPageData.messages.slice(3)],
  family: { following: { bookingId: 'bkg_desk', clientName: 'Maya R.' } },
  composer: { canSend: false, disabledReason: 'following', maxLength: 2000, maxAttachments: 4, maxPhotoMegabytes: 10 },
};

/** Lia's read-only booking page: confirmed, then Jordan on the way, then done, then following ended. */
export const followedDeskBooking: FollowedBookingView = {
  id: 'bkg_desk',
  task: { title: 'Assemble a desk (flat-pack, 1 item)', categorySlug: 'furniture-assembly' },
  status: 'confirmed',
  start: DESK_TIMES.agreedStart,
  timeZone: 'America/Chicago',
  place: { kind: 'local', areaName: 'Mueller' },
  client: { displayName: 'Maya R.', initials: 'MR' },
  helper: jordan,
  threadId: 'thr_bkg_desk',
};
export const followedDeskOnTheWay: FollowedBookingView = { ...followedDeskBooking, checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z' } };
export const followedDeskCompleted: FollowedBookingView = {
  ...followedDeskBooking,
  status: 'completed',
  checkIn: { onMyWayAt: '2026-11-21T15:58:00.000Z', arrivedAt: DESK_TIMES.arrived, completedAt: '2026-11-21T18:40:00.000Z' },
  endsAt: '2026-11-28T18:40:00.000Z',
};
export const followedDeskEnded: FollowedBookingView = { id: 'bkg_desk', task: followedDeskBooking.task, status: 'canceled', start: followedDeskBooking.start, timeZone: followedDeskBooking.timeZone, place: followedDeskBooking.place, client: followedDeskBooking.client, helper: jordan, ended: true };

export const followedDeskRow: FollowedBookingRow = {
  id: 'bkg_desk',
  title: 'Assemble a desk (flat-pack, 1 item)',
  categorySlug: 'furniture-assembly',
  status: 'confirmed',
  start: DESK_TIMES.agreedStart,
  clientName: 'Maya R.',
  helper: { displayName: jordan.displayName, initials: jordan.initials },
  place: { kind: 'local', areaName: 'Mueller' },
};

/** Lia's bookings: none of her own, one she follows. */
export const liaBookingsPageData: BookingsPageData = { needsAction: [], upcoming: [], past: [], following: [followedDeskRow] };
