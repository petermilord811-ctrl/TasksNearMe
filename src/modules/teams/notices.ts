import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AttentionTarget, NotificationType } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { threads } from '@/modules/messaging/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { partnerSideOf } from './jobs';
import { bookingTeams } from './schema';

/**
 * Who hears about a team's moments (2026-11-24; a4's sweep C5, B5), for the notification planner. Each answer reaches
 * the people it concerns as a notification, not only as a card in a conversation they may not open before the lead's
 * start. The client hears nothing before the partner's yes: they don't see an invite until then. When one of the two
 * bookings is canceled, the other helper hears it.
 */

export interface TeamNotice {
  userId: string;
  type: NotificationType;
  target: AttentionTarget;
  title: string;
  actorName: string;
}

type TeamRow = typeof bookingTeams.$inferSelect;

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

async function namesOf(db: Db, ids: string[]): Promise<Map<string, string>> {
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** The lead's booking conversation (the client's), where the team's card shows to them. */
async function leadThreadOf(db: Db, leadBookingId: string): Promise<string | undefined> {
  const [row] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, leadBookingId))).limit(1);
  return row?.id;
}

async function titleOf(db: Db, leadBookingId: string): Promise<string> {
  const [row] = await db.select({ title: tasks.title }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(eq(bookings.id, leadBookingId)).limit(1);
  return row?.title ?? '';
}

const teamTarget = (team: TeamRow): AttentionTarget => (team.teamThreadId ? { kind: 'thread', threadId: team.teamThreadId } : { kind: 'booking', bookingId: team.leadBookingId });

/**
 * A team event's notices (`team.*`, from teams/service.ts): the partner's invite, the client's proposal with the lead's
 * note of it, the answers, the client's yes or no. `fromStatus` (the status the team left) says whether a step back or
 * a canceled invite had reached the client.
 */
export async function planTeamNotices(db: Db, event: { type: string; payload: unknown }): Promise<TeamNotice[]> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const teamId = text(payload.teamId);
  if (!teamId) return [];
  const [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, teamId)).limit(1);
  if (!team) return [];
  const [names, title] = await Promise.all([namesOf(db, [team.leadUserId, team.partnerUserId, team.clientUserId]), titleOf(db, team.leadBookingId)]);
  const name = (id: string) => names.get(id) ?? '';
  const onTeam = teamTarget(team);
  const clientTarget = async (): Promise<AttentionTarget> => {
    const thread = await leadThreadOf(db, team.leadBookingId);
    return thread ? { kind: 'thread', threadId: thread } : { kind: 'booking', bookingId: team.leadBookingId };
  };
  const to = (userId: string, type: NotificationType, target: AttentionTarget, actorId: string): TeamNotice => ({ userId, type, target, title, actorName: name(actorId) });
  const reachedClient = ['accepted', 'confirmed'].includes(text(payload.fromStatus) ?? '');
  switch (event.type) {
    case 'team.invited':
      return [to(team.partnerUserId, 'team_invited', onTeam, team.leadUserId)];
    case 'team.accepted':
      return [to(team.clientUserId, 'team_proposed', await clientTarget(), team.leadUserId), to(team.leadUserId, 'team_accepted', onTeam, team.partnerUserId)];
    case 'team.declined':
      return [to(team.leadUserId, 'team_declined', onTeam, team.partnerUserId)];
    case 'team.confirmed':
      return [to(team.leadUserId, 'team_confirmed', onTeam, team.clientUserId), to(team.partnerUserId, 'team_confirmed', onTeam, team.clientUserId)];
    case 'team.refused':
      return [to(team.leadUserId, 'team_refused', onTeam, team.clientUserId), to(team.partnerUserId, 'team_refused', onTeam, team.clientUserId)];
    case 'team.canceled':
      return [to(team.partnerUserId, 'team_canceled', onTeam, team.leadUserId), ...(reachedClient ? [to(team.clientUserId, 'team_canceled', await clientTarget(), team.leadUserId)] : [])];
    case 'team.withdrawn':
      return [to(team.leadUserId, 'team_withdrawn', onTeam, team.partnerUserId), ...(reachedClient ? [to(team.clientUserId, 'team_withdrawn', await clientTarget(), team.partnerUserId)] : [])];
    default:
      return [];
  }
}

/**
 * One of a team job's bookings was canceled (B5): the other helper hears it. The partner's → the lead, while their own
 * booking is still on; the lead's → the partner of every team still in play or booked (theirs stays unless the client
 * cancels it), to their booking when it's booked.
 */
export async function teamNoticesForCanceled(db: Db, bookingId: string): Promise<TeamNotice[]> {
  const [row] = await db.select({ booking: bookings, title: tasks.title, teamPartOf: tasks.teamPartOf }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(eq(bookings.id, bookingId)).limit(1);
  if (!row) return [];
  if (row.teamPartOf) {
    const [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.partnerTaskId, row.booking.taskId)).limit(1);
    if (!team || team.status !== 'confirmed') return [];
    const [lead] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, team.leadBookingId)).limit(1);
    if (!lead || lead.status === 'canceled') return [];
    const names = await namesOf(db, [team.partnerUserId]);
    return [{ userId: team.leadUserId, type: 'team_partner_left', target: { kind: 'booking', bookingId: team.leadBookingId }, title: row.title, actorName: names.get(team.partnerUserId) ?? '' }];
  }
  const teams = await db.select().from(bookingTeams).where(and(eq(bookingTeams.leadBookingId, bookingId), inArray(bookingTeams.status, ['invited', 'accepted', 'confirmed']))).orderBy(desc(bookingTeams.createdAt));
  if (teams.length === 0) return [];
  const names = await namesOf(db, [row.booking.helperUserId]);
  const out: TeamNotice[] = [];
  for (const team of teams) {
    const side = await partnerSideOf(db, team);
    // A partner whose own booking ended already has nothing more to hear.
    if (side.partnerBooking?.status === 'canceled') continue;
    const target: AttentionTarget = side.partnerBookingId ? { kind: 'booking', bookingId: side.partnerBookingId } : teamTarget(team);
    out.push({ userId: team.partnerUserId, type: 'team_lead_canceled', target, title: row.title, actorName: names.get(row.booking.helperUserId) ?? '' });
  }
  return out;
}
