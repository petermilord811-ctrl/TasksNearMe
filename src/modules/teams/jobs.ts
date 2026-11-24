import { and, desc, eq, inArray } from 'drizzle-orm';
import type { TeamStatus } from '@/contracts';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { teamInPlay, type TeamFacts } from './domain';
import { bookingTeams } from './schema';

/**
 * A team's facts as the domain reads them, and a booking's place in a team job (sweep 2026-11-24, B4). Reads only, with
 * nothing of messaging or the offer flow: the booking module imports it (a team job's time is the team's).
 */

type TeamRow = typeof bookingTeams.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The partner's latest booking on their part, and whether its offer can still be booked. */
export async function partnerSideOf(db: Db | Tx, team: Pick<TeamRow, 'partnerTaskId' | 'partnerOfferId'>): Promise<Pick<TeamFacts, 'partnerBooking' | 'offerOpen'> & { partnerBookingId?: string }> {
  if (!team.partnerTaskId) return {};
  const [[booking], [offer]] = await Promise.all([
    db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.taskId, team.partnerTaskId)).orderBy(desc(bookings.createdAt)).limit(1),
    team.partnerOfferId ? db.select({ status: offers.status, expiresAt: offers.expiresAt }).from(offers).where(eq(offers.id, team.partnerOfferId)).limit(1) : Promise.resolve([]),
  ]);
  // A held part whose payment never went through (funding_failed): not booked, the offer open again.
  const live = booking && !(booking.status === 'canceled' && offer?.status === 'pending') ? booking : undefined;
  return {
    ...(live ? { partnerBooking: { status: live.status }, partnerBookingId: live.id } : {}),
    offerOpen: offer ? offer.status === 'pending' : false,
  };
}

/** A team's facts for the domain. */
export async function teamFactsOf(db: Db | Tx, team: TeamRow, lead: Pick<BookingRow, 'status' | 'startAt'>) {
  const side = await partnerSideOf(db, team);
  const facts: TeamFacts = { status: team.status as TeamStatus, lead: { status: lead.status, startAt: lead.startAt }, ...side };
  return { facts, partnerBookingId: side.partnerBookingId };
}

/** A lead's booking that's still a job (its partner's part goes with it while it is). */
const LEAD_LIVE = ['pending_funding', 'scheduled', 'confirmed', 'in_progress'];

/**
 * The booking is part of a team job now: a partner's part while the lead's booking is still a job, or a lead's booking
 * with a team in play (an invite waiting, or a partner booked or bookable). Its time is then the team's: a schedule
 * change would move one helper and not the other (sweep B4), so none is proposed or accepted meanwhile.
 */
export async function inTeamJob(db: Db | Tx, booking: Pick<BookingRow, 'id' | 'taskId' | 'status' | 'startAt'>, now: Date): Promise<boolean> {
  const [task] = await db.select({ teamPartOf: tasks.teamPartOf }).from(tasks).where(eq(tasks.id, booking.taskId)).limit(1);
  if (task?.teamPartOf) {
    const [lead] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, task.teamPartOf)).limit(1);
    return Boolean(lead && LEAD_LIVE.includes(lead.status));
  }
  const rows = await db.select().from(bookingTeams).where(and(eq(bookingTeams.leadBookingId, booking.id), inArray(bookingTeams.status, ['invited', 'accepted', 'confirmed'])));
  for (const team of rows) {
    if (teamInPlay((await teamFactsOf(db, team, booking)).facts, now)) return true;
  }
  return false;
}
