import type { AvailabilityStatus, NeighborhoodDayState, NeighborhoodVisitState } from '@/contracts';

/**
 * Neighborhood days (2026-11-24): what a visit and a day show, and what the helper may do, from the visits' slot
 * statuses and the clock. Pure, so the card, the helper's page and the tests agree.
 */

/** A visit is open while its slot is active and ahead, taken while requested or booked, and closed otherwise. */
export function visitStateOf(status: AvailabilityStatus, start: Date, now: Date): NeighborhoodVisitState {
  if (status === 'held' || status === 'booked') return 'taken';
  return status === 'active' && start > now ? 'open' : 'closed';
}

/**
 * `canceled` once the helper canceled it; `past` once every visit has started (or none is left); `full` with none open;
 * `filling` with some taken; `open` before the first is taken.
 */
export function dayStateOf(dayStatus: string, visits: readonly { state: NeighborhoodVisitState; start: Date }[], now: Date): NeighborhoodDayState {
  if (dayStatus === 'canceled') return 'canceled';
  if (visits.length === 0 || visits.every((visit) => visit.start <= now)) return 'past';
  if (!visits.some((visit) => visit.state === 'open')) return 'full';
  return visits.some((visit) => visit.state === 'taken') ? 'filling' : 'open';
}

/** The helper can cancel the day while it's open and a visit ahead is still open or requested (held). */
export function canCancelDay(dayStatus: string, visits: readonly { status: AvailabilityStatus; end: Date }[], now: Date): boolean {
  return dayStatus === 'open' && visits.some((visit) => (visit.status === 'active' || visit.status === 'held') && visit.end > now);
}
