import { and, eq, gt, inArray } from 'drizzle-orm';
import type { AppHomePageData, AttentionItem, HelperHomeData, Mode, PosterHomeData } from '@/contracts';
import { getBookingsPage } from '@/modules/bookings/hub';
import { users } from '@/modules/accounts/schema';
import { invites } from '@/modules/invites/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { bookings } from '@/modules/bookings/schema';
import { getEarningsPage } from '@/modules/earnings/service';
import { getInbox } from '@/modules/messaging/service';
import { getFindWorkPageData, getMyOffers, loadHelperState } from '@/modules/offers/helper';
import { getMyTasks } from '@/modules/offers/owner';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { marketDayKey } from '@/shared/format';

/**
 * The signed-in home (blueprint 02 §1.2): what needs the viewer's attention, most urgent first, then
 * what's coming up, for the mode they're in. Everything is composed from the modules' own reads.
 */

/** Items with a deadline first (soonest first), then the rest in the order given. */
function byUrgency(items: AttentionItem[]): AttentionItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.dueAt && b.item.dueAt) return a.item.dueAt.localeCompare(b.item.dueAt);
      if (a.item.dueAt) return -1;
      if (b.item.dueAt) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

async function unreadItem(db: Db, userId: string, now: Date): Promise<AttentionItem | null> {
  const inbox = await getInbox(db, userId, now);
  const unread = inbox.threads.filter((thread) => thread.unreadCount > 0);
  const count = unread.reduce((sum, thread) => sum + thread.unreadCount, 0);
  if (count === 0) return null;
  return {
    id: 'att_unread',
    kind: 'unread_messages',
    count,
    target: unread.length === 1 ? { kind: 'thread', threadId: unread[0]!.id } : { kind: 'messages' },
  };
}

async function bookingRows(db: Db, userId: string, role: 'poster' | 'helper') {
  return db
    .select({ booking: bookings, title: tasks.title })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(and(eq(role === 'poster' ? bookings.posterUserId : bookings.helperUserId, userId), inArray(bookings.status, ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted'])));
}

/** Invites waiting on this person: sent ones for helpers, countered ones for clients. */
async function waitingInvites(db: Db, side: 'poster' | 'helper', userId: string, now: Date) {
  // The other person: the helper who countered (client's side) or the client who invited (helper's side).
  return db
    .select({ id: invites.id, taskId: invites.taskId, title: tasks.title, expiresAt: invites.expiresAt, actorName: users.name })
    .from(invites)
    .innerJoin(tasks, eq(tasks.id, invites.taskId))
    .innerJoin(users, eq(users.id, side === 'poster' ? invites.helperUserId : invites.posterUserId))
    .where(and(eq(side === 'poster' ? invites.posterUserId : invites.helperUserId, userId), eq(invites.status, side === 'poster' ? 'countered' : 'sent'), gt(invites.expiresAt, now)));
}

/** The other person's display name on an attention item, when there is one. */
const named = (name: string | null): Pick<AttentionItem, 'actorName'> => (name ? { actorName: name } : {});

/** Rebooking proposals waiting on the client. */
async function waitingProposals(db: Db, userId: string, now: Date) {
  return db
    .select({ id: rebookProposals.id, title: tasks.title, expiresAt: rebookProposals.expiresAt, actorName: users.name })
    .from(rebookProposals)
    .innerJoin(bookings, eq(bookings.id, rebookProposals.fromBookingId))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(users, eq(users.id, rebookProposals.helperUserId))
    .where(and(eq(rebookProposals.posterUserId, userId), eq(rebookProposals.status, 'sent'), gt(rebookProposals.expiresAt, now)));
}

async function posterHome(db: Db, user: { id: string; firstName: string }, now: Date): Promise<PosterHomeData> {
  const [rows, mine, page, unread] = await Promise.all([
    bookingRows(db, user.id, 'poster'),
    getMyTasks(db, user.id, now),
    getBookingsPage(db, user.id, now),
    unreadItem(db, user.id, now),
  ]);
  const attention: AttentionItem[] = [];
  for (const { booking, title } of rows) {
    if (booking.status === 'completion_submitted') {
      attention.push({ id: `att_approve_${booking.id}`, kind: 'approve_work', title, ...(booking.approvalDueAt ? { dueAt: booking.approvalDueAt.toISOString() } : {}), target: { kind: 'booking', bookingId: booking.id } });
    } else if (booking.status === 'pending_funding') {
      attention.push({ id: `att_pay_${booking.id}`, kind: 'finish_payment', title, ...(booking.fundingExpiresAt ? { dueAt: booking.fundingExpiresAt.toISOString() } : {}), target: { kind: 'booking', bookingId: booking.id } });
    } else if (booking.status === 'in_progress' && booking.cantAccessAt && booking.posterResponseDueAt && booking.posterResponseDueAt > now) {
      attention.push({ id: `att_access_${booking.id}`, kind: 'answer_cant_access', title, dueAt: booking.posterResponseDueAt.toISOString(), target: { kind: 'booking', bookingId: booking.id } });
    }
  }
  for (const task of mine.open) {
    if (task.newOfferCount > 0) attention.push({ id: `att_offers_${task.id}`, kind: 'review_offers', title: task.title, count: task.newOfferCount, target: { kind: 'task', taskId: task.id } });
  }
  for (const counter of await waitingInvites(db, 'poster', user.id, now)) {
    attention.push({ id: `att_counter_${counter.id}`, kind: 'answer_counter', title: counter.title, ...(counter.expiresAt ? { dueAt: counter.expiresAt.toISOString() } : {}), ...named(counter.actorName), target: { kind: 'task', taskId: counter.taskId } });
  }
  for (const proposal of await waitingProposals(db, user.id, now)) {
    attention.push({ id: `att_proposal_${proposal.id}`, kind: 'answer_proposal', title: proposal.title, dueAt: proposal.expiresAt.toISOString(), ...named(proposal.actorName), target: { kind: 'proposal', proposalId: proposal.id } });
  }
  if (unread) attention.push(unread);
  return {
    mode: 'poster',
    firstName: user.firstName,
    attention: byUrgency(attention),
    upcoming: page.upcoming.filter((row) => row.viewerRole === 'poster').slice(0, 3),
    openTasks: mine.open.slice(0, 3),
  };
}

async function helperHome(db: Db, user: { id: string; firstName: string }, now: Date): Promise<HelperHomeData> {
  const [state, rows, offers, page, earnings, feed, unread] = await Promise.all([
    loadHelperState(db, user.id, now),
    bookingRows(db, user.id, 'helper'),
    getMyOffers(db, user.id, now),
    getBookingsPage(db, user.id, now),
    getEarningsPage(db, user.id, now),
    getFindWorkPageData(db, user.id, {}, now),
    unreadItem(db, user.id, now),
  ]);
  const attention: AttentionItem[] = [];
  if (earnings.payoutAccount.actionNeeded) attention.push({ id: 'att_payout', kind: 'payout_action_needed', target: { kind: 'earnings' } });
  if (!state.setup.bookable) {
    attention.push({ id: 'att_setup', kind: 'finish_setup', target: { kind: 'onboarding', step: state.setup.nextOnboardingStep ?? 'profile' } });
  }
  const today = marketDayKey(now);
  for (const { booking, title } of rows) {
    if (booking.status === 'confirmed' && !booking.arrivedAt && marketDayKey(booking.startAt) === today) {
      attention.push({ id: `att_checkin_${booking.id}`, kind: 'check_in_today', title, dueAt: booking.startAt.toISOString(), target: { kind: 'booking', bookingId: booking.id } });
    }
  }
  for (const row of offers.active) {
    if (row.offer.status === 'stale') attention.push({ id: `att_reconfirm_${row.offer.id}`, kind: 'reconfirm_offer', title: row.task.title, target: { kind: 'find_work_task', taskId: row.task.id } });
  }
  for (const invite of await waitingInvites(db, 'helper', user.id, now)) {
    attention.push({ id: `att_invite_${invite.id}`, kind: 'answer_invite', title: invite.title, ...(invite.expiresAt ? { dueAt: invite.expiresAt.toISOString() } : {}), ...named(invite.actorName), target: { kind: 'invite', inviteId: invite.id } });
  }
  if (unread) attention.push(unread);
  const open = feed?.cards.filter((card) => !card.blockedReason && !card.myOffer) ?? [];
  return {
    mode: 'helper',
    firstName: user.firstName,
    attention: byUrgency(attention),
    upcoming: page.upcoming.filter((row) => row.viewerRole === 'helper').slice(0, 3),
    activeOffers: offers.active.slice(0, 3),
    suggestions: (state.setup.bookable ? open : (feed?.cards ?? [])).slice(0, 3),
    earnings: { upcomingCents: earnings.totals.upcomingCents, onTheWayCents: earnings.totals.onTheWayCents },
    setup: state.setup,
  };
}

/** `/app` for the viewer's current mode. */
export async function getAppHome(db: Db, user: { id: string; firstName: string; mode: Mode }, now: Date): Promise<AppHomePageData> {
  return user.mode === 'helper' ? helperHome(db, user, now) : posterHome(db, user, now);
}
