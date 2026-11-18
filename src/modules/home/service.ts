import { and, eq, gt, gte, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  type AttentionItem,
  type CategorySlug,
  type DashboardData,
  type DashboardItem,
  type DashboardQuery,
  type DashboardTab,
  type Mode,
  type OfferStatus,
  type TaskPublicView,
  type TimeZone,
} from '@/contracts';
import { getBookingsPage } from '@/modules/bookings/hub';
import { users } from '@/modules/accounts/schema';
import { aiSearchAccess } from '@/modules/billing/entitlements';
import { invites } from '@/modules/invites/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { bookings } from '@/modules/bookings/schema';
import { getEarningsPage } from '@/modules/earnings/service';
import { getInbox } from '@/modules/messaging/service';
import { listCategoryViews } from '@/modules/markets/queries';
import { mapTiles } from '@/modules/markets/map-tiles';
import { markets } from '@/modules/markets/schema';
import { getFindWorkPageData, getMyOffers, loadHelperState, type HelperState } from '@/modules/offers/helper';
import { getMyTasks, offerPricing } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { listFeedTasks, selectPublic, toRow } from '@/modules/tasks/queries';
import { toTaskPublicView } from '@/modules/tasks/projections';
import { tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import { marketTimeZones } from '@/modules/markets/time-zone';
import type { Db } from '@/platform/db/connect';
import { marketDayKey } from '@/shared/format';
import {
  bookingItem,
  composeDashboardLists,
  dashboardDateRange,
  dashboardSeeAll,
  dashboardSummary,
  dashboardTabsFor,
  nearbyItem,
  ownTaskItem,
  receivedOfferItem,
  resolveDashboardQuery,
  sentOfferItem,
} from '@/shared/dashboard';

/**
 * The signed-in home (blueprint 02 §1.2) as a dashboard (completion plan 9.9, docs/ui/dashboard-9.9.md): what needs
 * the person, then their tasks, offers, bookings and nearby tasks as lists under the filters in the URL. The lists
 * are composed from the modules' own reads; the rules (tabs, stages, filters) are src/shared/dashboard.ts.
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

type MyTasks = Awaited<ReturnType<typeof getMyTasks>>;

/** The client's side of "Needs your attention" (blueprint 02 §1.2). */
async function clientAttention(db: Db, userId: string, mine: MyTasks, now: Date): Promise<AttentionItem[]> {
  const [rows, counters, proposals] = await Promise.all([bookingRows(db, userId, 'poster'), waitingInvites(db, 'poster', userId, now), waitingProposals(db, userId, now)]);
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
  for (const counter of counters) {
    attention.push({ id: `att_counter_${counter.id}`, kind: 'answer_counter', title: counter.title, ...(counter.expiresAt ? { dueAt: counter.expiresAt.toISOString() } : {}), ...named(counter.actorName), target: { kind: 'task', taskId: counter.taskId } });
  }
  for (const proposal of proposals) {
    attention.push({ id: `att_proposal_${proposal.id}`, kind: 'answer_proposal', title: proposal.title, dueAt: proposal.expiresAt.toISOString(), ...named(proposal.actorName), target: { kind: 'proposal', proposalId: proposal.id } });
  }
  return attention;
}

/** The helper's side of "Needs your attention". */
async function helperAttention(
  db: Db,
  userId: string,
  input: { state: HelperState; activeOffers: Awaited<ReturnType<typeof getMyOffers>>['active']; payoutActionNeeded: boolean },
  now: Date,
): Promise<AttentionItem[]> {
  const [rows, sent] = await Promise.all([bookingRows(db, userId, 'helper'), waitingInvites(db, 'helper', userId, now)]);
  const attention: AttentionItem[] = [];
  if (input.payoutActionNeeded) attention.push({ id: 'att_payout', kind: 'payout_action_needed', target: { kind: 'earnings' } });
  if (!input.state.setup.bookable) {
    attention.push({ id: 'att_setup', kind: 'finish_setup', target: { kind: 'onboarding', step: input.state.setup.nextOnboardingStep ?? 'profile' } });
  }
  // "Today" on the booking's market clock (completion plan 8.1).
  const zones = await marketTimeZones(db, rows.map(({ booking }) => booking.marketId));
  for (const { booking, title } of rows) {
    const timeZone = zones.get(booking.marketId)!;
    if (booking.status === 'confirmed' && !booking.arrivedAt && marketDayKey(booking.startAt, timeZone) === marketDayKey(now, timeZone)) {
      attention.push({ id: `att_checkin_${booking.id}`, kind: 'check_in_today', title, dueAt: booking.startAt.toISOString(), target: { kind: 'booking', bookingId: booking.id } });
    }
  }
  for (const row of input.activeOffers) {
    if (row.offer.status === 'stale') attention.push({ id: `att_reconfirm_${row.offer.id}`, kind: 'reconfirm_offer', title: row.task.title, target: { kind: 'find_work_task', taskId: row.task.id } });
  }
  for (const invite of sent) {
    attention.push({ id: `att_invite_${invite.id}`, kind: 'answer_invite', title: invite.title, ...(invite.expiresAt ? { dueAt: invite.expiresAt.toISOString() } : {}), ...named(invite.actorName), target: { kind: 'invite', inviteId: invite.id } });
  }
  return attention;
}

/**
 * The sides a person has (docs/ui/dashboard-9.9.md §3): the mode's always; a client too when they've posted, a helper
 * too when they have a helper profile and have sent an offer or been booked.
 */
async function sidesOf(db: Db, userId: string, mode: Mode): Promise<{ client: boolean; helper: boolean }> {
  const [[posted], [profile], [offered], [booked]] = await Promise.all([
    mode === 'poster' ? Promise.resolve([{ id: '' }]) : db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.posterUserId, userId), ne(tasks.status, 'draft'))).limit(1),
    mode === 'helper' ? Promise.resolve([{ userId }]) : db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    mode === 'helper' ? Promise.resolve([{ id: '' }]) : db.select({ id: offers.id }).from(offers).where(eq(offers.helperUserId, userId)).limit(1),
    mode === 'helper' ? Promise.resolve([{ id: '' }]) : db.select({ id: bookings.id }).from(bookings).where(eq(bookings.helperUserId, userId)).limit(1),
  ]);
  return { client: mode === 'poster' || Boolean(posted), helper: mode === 'helper' || Boolean(profile && (offered || booked)) };
}

/** Each of the client's own tasks as a row, with its general area (from the task's public view). */
async function ownTaskItems(db: Db, mine: MyTasks): Promise<DashboardItem[]> {
  const rows = [...mine.open, ...mine.booked, ...mine.past];
  if (rows.length === 0) return [];
  const views = new Map((await selectPublic(db).where(inArray(tasks.id, rows.map((row) => row.id)))).map((row) => [row.id, toTaskPublicView(toRow(row))] as const));
  return rows.flatMap((row) => {
    const view = views.get(row.id);
    return view ? [ownTaskItem(row, view.location, view.taskType)] : [];
  });
}

/** Offers waiting on the client: open ones on their open tasks, the unopened marked new. */
async function receivedOfferItems(db: Db, userId: string, now: Date): Promise<DashboardItem[]> {
  const rows = await db
    .select({ offer: offers, taskId: tasks.id })
    .from(offers)
    .innerJoin(tasks, eq(tasks.id, offers.taskId))
    .where(
      and(
        eq(tasks.posterUserId, userId),
        eq(tasks.status, 'open'),
        gt(tasks.windowEnd, now),
        inArray(offers.status, ['pending', 'stale']),
        gt(offers.expiresAt, now),
        // Offers made before Find a replacement reopened a task belong to the canceled booking.
        or(isNull(tasks.reopenedAt), gte(offers.createdAt, tasks.reopenedAt)),
      ),
    );
  if (rows.length === 0) return [];
  const [views, helpers] = await Promise.all([
    selectPublic(db).where(inArray(tasks.id, [...new Set(rows.map((row) => row.taskId))])).then((found) => new Map(found.map((row) => [row.id, toTaskPublicView(toRow(row))] as const))),
    getHelperSummaries(rows.map((row) => row.offer.helperUserId), db),
  ]);
  return rows.flatMap(({ offer, taskId }) => {
    const task = views.get(taskId);
    const helper = helpers.get(offer.helperUserId);
    if (!task || !helper) return [];
    return [
      receivedOfferItem({
        offer: { id: offer.id, status: offer.status as OfferStatus, pricing: offerPricing(offer), proposedStart: offer.proposedStart.toISOString(), isNew: offer.posterSeenAt === null },
        task: { id: task.id, title: task.title, categorySlug: task.categorySlug, ...(task.taskType ? { taskType: task.taskType } : {}), location: task.location },
        helper,
      }),
    ];
  });
}

/** How many open tasks nearby the dashboard reads at once (the tab counts them; the list shows the first 20). */
const NEARBY_LIMIT = 100;

/** Open tasks in the client's market for their search (others' tasks; their own and blocked people's left out). */
async function clientNearby(db: Db, userId: string, marketId: string, filters: { category?: CategorySlug; q?: string; window?: { from: Date; to: Date } }, now: Date): Promise<TaskPublicView[]> {
  const blocked = await blockedPeopleOf(db, userId);
  const { tasks: found } = await listFeedTasks(db, {
    marketId,
    query: { areas: [], times: [], few: false, when: 'any', remoteOnly: false, sort: 'soonest', distance: 'any', saved: false, view: 'list', page: 1, ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}) },
    now,
    excludePosterIds: [userId, ...blocked],
    center: null,
    maxMiles: null,
    ...(filters.window ? { window: filters.window } : {}),
    limit: NEARBY_LIMIT,
  });
  return found.map((row) => row.view);
}

export interface DashboardViewer {
  id: string;
  firstName: string;
  mode: Mode;
  /** The person's own market clock: "today" and the date filter (completion plan 8.1). */
  timeZone: TimeZone;
}

/** `/app` for this person under the filters in the URL. */
export async function getDashboard(db: Db, viewer: DashboardViewer, query: DashboardQuery, now: Date): Promise<DashboardData> {
  const { id: userId } = viewer;
  const sides = await sidesOf(db, userId, viewer.mode);
  const tabs = dashboardTabsFor(viewer.mode, sides, Boolean(query.q));
  const filters = resolveDashboardQuery(query, tabs);
  const range = dashboardDateRange(filters.date, filters.status, now, viewer.timeZone);
  // Nearby tasks are all open: other statuses show none, so they aren't read.
  const nearbyWanted = tabs.includes('nearby') && (filters.status === 'active' || filters.status === 'open');
  const words = { ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}) };

  const [[home], page, unread, access] = await Promise.all([
    db.select({ marketId: users.homeMarketId, marketSlug: markets.slug, lat: markets.centerLat, lng: markets.centerLng }).from(users).leftJoin(markets, eq(markets.id, users.homeMarketId)).where(eq(users.id, userId)).limit(1),
    getBookingsPage(db, userId, now),
    unreadItem(db, userId, now),
    aiSearchAccess(db, userId, now),
  ]);

  const client = sides.client
    ? await (async () => {
        const mine = await getMyTasks(db, userId, now);
        const [taskItems, received, attention] = await Promise.all([ownTaskItems(db, mine), receivedOfferItems(db, userId, now), clientAttention(db, userId, mine, now)]);
        return { taskItems, received, attention };
      })()
    : null;

  const helper = sides.helper
    ? await (async () => {
        const [state, sent, earnings, feed] = await Promise.all([
          loadHelperState(db, userId, now),
          getMyOffers(db, userId, now),
          getEarningsPage(db, userId, now),
          // Find work's own read (its area, setup, waiting for the city); only its first row when nearby isn't shown.
          nearbyWanted
            ? getFindWorkPageData(db, userId, words, now, { limit: NEARBY_LIMIT, ...(range ? { window: range } : {}) })
            : getFindWorkPageData(db, userId, {}, now, { limit: 1 }),
        ]);
        const attention = await helperAttention(db, userId, { state, activeOffers: sent.active, payoutActionNeeded: earnings.payoutAccount.actionNeeded }, now);
        // Matches: tasks they can offer on and haven't yet; while setting up, everything nearby to browse.
        const cards = nearbyWanted && feed && !feed.waitingFor ? feed.cards.filter((card) => !card.myOffer && (!state.setup.bookable || !card.blockedReason)) : [];
        return { state, sent, earnings, feed, attention, nearby: cards.map((card) => nearbyItem(card.task, 'helper', now)) };
      })()
    : null;

  const marketId = helper?.state.marketId ?? home?.marketId ?? null;
  const [categoryViews, clientNearbyTasks] = await Promise.all([
    marketId ? listCategoryViews(marketId, db) : Promise.resolve([]),
    !helper && nearbyWanted && marketId ? clientNearby(db, userId, marketId, { ...words, ...(range ? { window: range } : {}) }, now) : Promise.resolve([]),
  ]);

  const bookingRowsAll = [...page.upcoming, ...page.past].filter((row) => (row.viewerRole === 'poster' ? sides.client : sides.helper));
  const itemsOf: Record<DashboardTab, DashboardItem[]> = {
    tasks: client?.taskItems ?? [],
    offers: [...(client?.received ?? []), ...(helper ? [...helper.sent.active, ...helper.sent.booked, ...helper.sent.closed].map(sentOfferItem) : [])],
    bookings: bookingRowsAll.map(bookingItem),
    nearby: helper ? helper.nearby : clientNearbyTasks.map((task) => nearbyItem(task, 'client', now)),
  };
  const lists = composeDashboardLists(filters, tabs, itemsOf, { now, timeZone: viewer.timeZone });

  // Both sides' items for someone who has both; the unread messages once.
  const seen = new Set<string>();
  const attention = byUrgency([...(client?.attention ?? []), ...(helper?.attention ?? []), ...(unread ? [unread] : [])].filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id))));

  const area = helper?.feed?.map.area;

  return {
    firstName: viewer.firstName,
    mode: viewer.mode,
    sides,
    attention,
    summary: dashboardSummary(attention.length, itemsOf.bookings, now, viewer.timeZone),
    ...lists,
    categories: categoryViews.map((category) => category.slug),
    seeAll: dashboardSeeAll(filters.tab, { mode: viewer.mode, sides, ...(home?.marketSlug ? { market: home.marketSlug } : {}), words }),
    map: {
      ...mapTiles(),
      center: helper?.feed?.map.marketCenter ?? (home?.lat !== null && home?.lat !== undefined && home.lng !== null ? { lat: home.lat, lng: home.lng } : { lat: 29.6516, lng: -82.3248 }),
      ...(area ? { serviceArea: { name: area.name, center: area.center, radiusMiles: area.serviceRadiusMiles } } : {}),
    },
    // Earnings at a glance once there's something to show: a helper who can take work, or money on its way.
    ...(helper && (helper.state.setup.bookable || helper.earnings.totals.upcomingCents > 0 || helper.earnings.totals.onTheWayCents > 0)
      ? { earnings: { upcomingCents: helper.earnings.totals.upcomingCents, onTheWayCents: helper.earnings.totals.onTheWayCents } }
      : {}),
    ...(helper && !helper.state.setup.bookable ? { setup: helper.state.setup } : {}),
    ...(helper?.feed?.waitingFor ? { waitingFor: helper.feed.waitingFor } : {}),
    aiSearch: access,
  };
}

