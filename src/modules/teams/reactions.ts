import { and, eq, inArray, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { postInDirectThread } from '@/modules/messaging/direct';
import { messages } from '@/modules/messaging/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { bookingTeams } from './schema';
import { expireTeam } from './service';

/**
 * A team job when one of its bookings is canceled (2026-11-24; a4's sweep B5, B8), for the outbox dispatcher after the
 * event's notifications (teams/notices.ts tells the other helper). The two helpers read it in their team conversation,
 * once: "Jordan's booking was canceled". What wasn't booked ends with the lead's booking (an invite in play, or a part
 * never booked: nothing left open to book); a booked partner's booking goes on, for the client to keep or cancel. Runs
 * at least once per event: every step checks first, so running it twice changes nothing.
 */

type TeamRow = typeof bookingTeams.$inferSelect;

export async function reactToTeamEvent(db: Db, event: { type: string; aggregateId: string; payload: unknown }, now: Date): Promise<void> {
  if (event.type !== 'booking.canceled') return;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const bookingId = typeof payload.bookingId === 'string' && payload.bookingId ? payload.bookingId : event.aggregateId;
  const [row] = await db.select({ booking: bookings, teamPartOf: tasks.teamPartOf }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(eq(bookings.id, bookingId)).limit(1);
  if (!row || row.booking.status !== 'canceled') return;
  if (row.teamPartOf) {
    const [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.partnerTaskId, row.booking.taskId)).limit(1);
    if (team) await teamLine(db, team, 'team_partner_canceled', team.partnerUserId, now);
    return;
  }
  const teams = await db.select().from(bookingTeams).where(and(eq(bookingTeams.leadBookingId, bookingId), inArray(bookingTeams.status, ['invited', 'accepted', 'confirmed'])));
  for (const team of teams) {
    await expireTeam(db, team.id, now);
    await teamLine(db, team, 'team_lead_canceled', team.leadUserId, now);
  }
}

/** "{name}'s booking was canceled" in the two helpers' conversation, once per team and kind. */
async function teamLine(db: Db, team: TeamRow, type: 'team_lead_canceled' | 'team_partner_canceled', whoId: string, now: Date): Promise<void> {
  if (!team.teamThreadId) return;
  const [posted] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.threadId, team.teamThreadId), sql`${messages.event}->>'type' = ${type}`, sql`${messages.event}->'params'->>'teamId' = ${team.id}`))
    .limit(1);
  if (posted) return;
  const [who] = await db.select({ name: users.name }).from(users).where(eq(users.id, whoId)).limit(1);
  await postInDirectThread(db, team.leadUserId, team.partnerUserId, { type, params: { teamId: team.id, name: who?.name ?? '' } }, now, whoId);
}
