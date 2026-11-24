import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { routes, type BookingTeamView, type PaymentMode, type TeamBar, type TeamInviteCard, type TeamMember, type TeamStatus, type TeamViewerRole } from '@/contracts';
import { usernames, users } from '@/modules/accounts/schema';
import { deletedLabelFor, shownPerson } from '@/modules/accounts/shown-name';
import { pricingOf } from '@/modules/bookings/pricing-columns';
import { bookings } from '@/modules/bookings/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { markets } from '@/modules/markets/schema';
import { threads } from '@/modules/messaging/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { cancelChoiceOpen, showsPartnerPrice, teamActions, teamStatusNow } from './domain';
import { bookingTeams } from './schema';
import { teamFactsOf } from './jobs';
import { canInviteFor } from './service';

/**
 * Team up as each of its three people sees it (2026-11-24): the cards in conversations, the panel on the booking pages,
 * the team bar on the conversations and the team mark on the bookings list. Role-projected: the partner's price to the
 * partner and the client (and the lead while asking), the partner's booking to the client and the partner, and each
 * helper sees the other's name and role only.
 */

type TeamRow = typeof bookingTeams.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;

async function membersOf(db: Db, ids: string[]): Promise<Map<string, TeamMember>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ user: users, username: usernames.username })
    .from(users)
    .leftJoin(usernames, eq(usernames.userId, users.id))
    .where(inArray(users.id, [...new Set(ids)]));
  const label = await deletedLabelFor(rows.map((row) => row.user));
  return new Map(
    rows.map(({ user, username }) => {
      const shown = shownPerson(user, label);
      return [user.id, { displayName: shown.displayName, initials: shown.initials, ...profilePhotoOf(user), ...(username && !shown.deleted ? { username } : {}) }];
    }),
  );
}

const fallback: TeamMember = { displayName: '', initials: '' };

/** One team as `viewerId` sees it (null: not one of its people). */
async function cardOf(db: Db, team: TeamRow, viewerId: string, now: Date, members?: Map<string, TeamMember>): Promise<TeamInviteCard | null> {
  const role: TeamViewerRole | null = viewerId === team.clientUserId ? 'client' : viewerId === team.leadUserId ? 'lead' : viewerId === team.partnerUserId ? 'partner' : null;
  if (!role) return null;
  const [lead] = await db
    .select({ booking: bookings, title: tasks.title, timeZone: markets.timeZone })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(markets, eq(markets.id, bookings.marketId))
    .where(eq(bookings.id, team.leadBookingId))
    .limit(1);
  if (!lead) return null;
  const { facts, partnerBookingId } = await teamFactsOf(db, team, lead.booking);
  const status = teamStatusNow(facts, now);
  const people = members ?? (await membersOf(db, [team.leadUserId, team.partnerUserId]));
  const actions = teamActions(facts, role, now);
  return {
    teamId: team.id,
    viewerRole: role,
    status,
    lead: people.get(team.leadUserId) ?? fallback,
    partner: people.get(team.partnerUserId) ?? fallback,
    title: lead.title,
    start: lead.booking.startAt.toISOString(),
    timeZone: lead.timeZone,
    ...(showsPartnerPrice(role, status) ? { pricing: pricingOf(team) } : {}),
    paymentMode: lead.booking.paymentMode as PaymentMode,
    ...(team.note && role !== 'client' ? { note: team.note } : {}),
    ...(actions.includes('book') && team.partnerTaskId && team.partnerOfferId ? { bookHref: routes.app.confirmOffer(team.partnerTaskId, team.partnerOfferId) } : {}),
    ...(partnerBookingId && role !== 'lead' && facts.partnerBooking ? { partnerBooking: { bookingId: partnerBookingId, status: facts.partnerBooking.status } } : {}),
    actions,
  };
}

/** The team cards a conversation's lines show (`team_invited`, `team_proposed`), by team id, for the viewer. */
export async function teamCardsFor(db: Db, viewerId: string, teamIds: string[], now: Date): Promise<Record<string, TeamInviteCard>> {
  if (teamIds.length === 0) return {};
  const rows = await db
    .select()
    .from(bookingTeams)
    .where(and(inArray(bookingTeams.id, [...new Set(teamIds)]), or(eq(bookingTeams.clientUserId, viewerId), eq(bookingTeams.leadUserId, viewerId), eq(bookingTeams.partnerUserId, viewerId))));
  const people = await membersOf(db, rows.flatMap((row) => [row.leadUserId, row.partnerUserId]));
  const out: Record<string, TeamInviteCard> = {};
  for (const row of rows) {
    // The client's card is the one in the lead's booking conversation, from the partner's yes on.
    const card = await cardOf(db, row, viewerId, now, people);
    if (card) out[row.id] = card;
  }
  return out;
}

/** The team a partner's part belongs to (its task is `team_part_of`). */
async function teamOfPart(db: Db, partTaskId: string): Promise<TeamRow | null> {
  const [row] = await db.select().from(bookingTeams).where(eq(bookingTeams.partnerTaskId, partTaskId)).limit(1);
  return row ?? null;
}

/** The lead booking's team to show: one in play first, else the latest confirmed one. */
async function teamOfLead(db: Db, leadBookingId: string): Promise<TeamRow | null> {
  const rows = await db.select().from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadBookingId)).orderBy(desc(bookingTeams.createdAt)).limit(5);
  return rows.find((row) => row.status === 'invited' || row.status === 'accepted') ?? rows.find((row) => row.status === 'confirmed') ?? rows[0] ?? null;
}

/**
 * The booking page's team panel. On the lead's booking: the lead's "Team up" (when they can invite), the invite as it
 * stands (the client from the partner's yes on), and the client's choice when the lead's booking was canceled. On the
 * partner's booking: who leads the job (and, for the client, the lead's booking).
 */
export async function bookingTeamFor(db: Db, viewerId: string, booking: BookingRow, now: Date): Promise<BookingTeamView | undefined> {
  const viewer: 'client' | 'helper' | null = viewerId === booking.posterUserId ? 'client' : viewerId === booking.helperUserId ? 'helper' : null;
  if (!viewer) return undefined;
  const [task] = await db.select({ teamPartOf: tasks.teamPartOf }).from(tasks).where(eq(tasks.id, booking.taskId)).limit(1);
  if (task?.teamPartOf) {
    const team = await teamOfPart(db, booking.taskId);
    if (!team) return undefined;
    const role: TeamViewerRole = viewer === 'client' ? 'client' : 'partner';
    const people = await membersOf(db, [team.leadUserId, team.partnerUserId]);
    return {
      viewerRole: role,
      part: 'partner',
      lead: people.get(team.leadUserId) ?? fallback,
      ...(role === 'client' ? { leadBookingId: team.leadBookingId } : {}),
      ...(role === 'partner' && team.teamThreadId ? { teamThreadId: team.teamThreadId } : {}),
    };
  }
  const role: TeamViewerRole = viewer === 'client' ? 'client' : 'lead';
  const team = await teamOfLead(db, booking.id);
  const canInvite = role === 'lead' ? await canInviteFor(db, booking, null, now) : false;
  // The client sees the team from the partner's yes on (not a declined invite); the lead their own invites, but not a
  // team that ended with the partner's booking canceled (they can invite again: `canInvite`).
  const visible = role === 'lead' ? !(canInvite && team?.status === 'confirmed') : team !== null && team.answeredAt !== null && team.status !== 'declined';
  const shown = team && visible ? await cardOf(db, team, viewerId, now) : null;
  let cancelChoice: BookingTeamView['cancelChoice'];
  if (role === 'client' && team && shown?.partnerBooking && cancelChoiceOpen(booking.status, shown.partnerBooking.status, team.clientKeptAt !== null)) {
    cancelChoice = { partnerBookingId: shown.partnerBooking.bookingId, partner: shown.partner };
  }
  if (!canInvite && !shown) return undefined;
  return {
    viewerRole: role,
    part: 'lead',
    ...(canInvite ? { canInvite: true } : {}),
    ...(shown ? { invite: shown } : {}),
    ...(cancelChoice ? { cancelChoice } : {}),
    ...(role === 'lead' && team?.teamThreadId && shown ? { teamThreadId: team.teamThreadId } : {}),
  };
}

const IN_TEAM: TeamStatus[] = ['confirmed'];

/** The bookings on each side of a confirmed team (the partner's latest booking on their part). */
async function partnerBookingOf(db: Db, team: TeamRow): Promise<{ id: string; status: string } | null> {
  if (!team.partnerTaskId) return null;
  const [row] = await db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.taskId, team.partnerTaskId)).orderBy(desc(bookings.createdAt)).limit(1);
  return row ?? null;
}

/**
 * The team bar on a team job's conversations: the client's two booking conversations, or a helper's booking
 * conversation and the team conversation. Only once the partner's part is booked.
 */
export async function teamBarFor(db: Db, viewerId: string, thread: { id: string; kind: string; linkedId: string }): Promise<TeamBar | undefined> {
  let team: TeamRow | null = null;
  if (thread.kind === 'booking') {
    const [row] = await db.select({ taskId: bookings.taskId, teamPartOf: tasks.teamPartOf }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(eq(bookings.id, thread.linkedId)).limit(1);
    if (!row) return undefined;
    team = row.teamPartOf ? await teamOfPart(db, row.taskId) : await teamOfLead(db, thread.linkedId);
  } else if (thread.kind === 'direct') {
    const [row] = await db.select().from(bookingTeams).where(and(eq(bookingTeams.teamThreadId, thread.id), inArray(bookingTeams.status, IN_TEAM))).orderBy(desc(bookingTeams.confirmedAt)).limit(1);
    team = row ?? null;
  }
  if (!team || !IN_TEAM.includes(team.status as TeamStatus)) return undefined;
  const role: TeamViewerRole | null = viewerId === team.clientUserId ? 'client' : viewerId === team.leadUserId ? 'lead' : viewerId === team.partnerUserId ? 'partner' : null;
  if (!role) return undefined;
  const partner = await partnerBookingOf(db, team);
  if (!partner || partner.status === 'canceled') return undefined;
  const bookingThreads = await db.select({ id: threads.id, linkedId: threads.linkedId }).from(threads).where(and(eq(threads.kind, 'booking'), inArray(threads.linkedId, [team.leadBookingId, partner.id])));
  const threadOf = (bookingId: string) => bookingThreads.find((row) => row.linkedId === bookingId)?.id;
  const candidates: { kind: 'lead_booking' | 'partner_booking' | 'team'; threadId: string | undefined }[] =
    role === 'client'
      ? [{ kind: 'lead_booking', threadId: threadOf(team.leadBookingId) }, { kind: 'partner_booking', threadId: threadOf(partner.id) }]
      : role === 'lead'
        ? [{ kind: 'lead_booking', threadId: threadOf(team.leadBookingId) }, { kind: 'team', threadId: team.teamThreadId ?? undefined }]
        : [{ kind: 'partner_booking', threadId: threadOf(partner.id) }, { kind: 'team', threadId: team.teamThreadId ?? undefined }];
  const conversations = candidates.flatMap((item) => (item.threadId ? [{ kind: item.kind, threadId: item.threadId, current: item.threadId === thread.id }] : []));
  if (!conversations.some((item) => item.current) || conversations.length < 2) return undefined;
  const people = await membersOf(db, [team.leadUserId, team.partnerUserId]);
  return { lead: people.get(team.leadUserId) ?? fallback, partner: people.get(team.partnerUserId) ?? fallback, viewerRole: role, conversations };
}

/** "Team: Jordan (lead) and Sam" on the bookings list, for both parts of a confirmed team, by booking id. */
export async function teamTagsFor(db: Db, rows: readonly Pick<BookingRow, 'id' | 'taskId'>[]): Promise<Map<string, { part: 'lead' | 'partner'; lead: string; partner: string }>> {
  const out = new Map<string, { part: 'lead' | 'partner'; lead: string; partner: string }>();
  if (rows.length === 0) return out;
  const teams = await db
    .select()
    .from(bookingTeams)
    .where(and(eq(bookingTeams.status, 'confirmed'), or(inArray(bookingTeams.leadBookingId, rows.map((row) => row.id)), inArray(bookingTeams.partnerTaskId, rows.map((row) => row.taskId)))));
  if (teams.length === 0) return out;
  const people = await membersOf(db, teams.flatMap((team) => [team.leadUserId, team.partnerUserId]));
  for (const team of teams) {
    const tag = { lead: people.get(team.leadUserId)?.displayName ?? '', partner: people.get(team.partnerUserId)?.displayName ?? '' };
    // Only once the partner's part is booked (and not canceled): the lead's row, and the partner's.
    const partner = await partnerBookingOf(db, team);
    if (!partner || partner.status === 'canceled') continue;
    out.set(team.leadBookingId, { part: 'lead', ...tag });
    out.set(partner.id, { part: 'partner', ...tag });
  }
  return out;
}
