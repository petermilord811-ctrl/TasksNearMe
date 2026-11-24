import type { TeamActionId, TeamStatus, TeamViewerRole } from '@/contracts';

/**
 * Team up's rules (2026-11-24; blueprint 03 "Team jobs"), pure: who may invite, whom, and what each of the three people
 * can do on an invite now. Nothing here touches money or a booking's states: the partner's booking, once the client
 * books it, is an ordinary booking.
 */

/** Booking states where the partner's booking can still be canceled before the work (the client's "cancel both"). */
const BEFORE_WORK = ['pending_funding', 'scheduled', 'confirmed'];

export interface LeadBookingFacts {
  status: string;
  startAt: Date;
  /** A visit of regular visits: no team (each visit is its own booking with the series' helper). */
  seriesId: string | null;
  /** The booking is itself a partner's part: a partner can't bring a third person. */
  teamPartOf: string | null;
}

export interface TeamFacts {
  status: TeamStatus;
  lead: { status: string; startAt: Date };
  /** The partner's booking on their part, the latest one (absent until the client books it). */
  partnerBooking?: { status: string } | null;
  /** The partner's offer on their part can still be booked (`pending`). */
  offerOpen?: boolean;
}

/**
 * The status as it reads now: an invite still waiting, or a confirmed part never booked, lapses (`expired`) once the
 * lead's booking starts or isn't confirmed any more (whether or not anything marked it yet).
 */
export function teamStatusNow(team: TeamFacts, now: Date): TeamStatus {
  const lapsed = team.lead.startAt <= now || team.lead.status !== 'confirmed';
  if ((team.status === 'invited' || team.status === 'accepted') && lapsed) return 'expired';
  if (team.status === 'confirmed' && !team.partnerBooking && (lapsed || team.offerOpen === false)) return 'expired';
  return team.status;
}

/** The team still holds the lead's one partner place: an invite in play, or a part booked (or bookable) and not canceled. */
export function teamInPlay(team: TeamFacts, now: Date): boolean {
  const status = teamStatusNow(team, now);
  if (status === 'invited' || status === 'accepted') return true;
  if (status !== 'confirmed') return false;
  return team.partnerBooking ? team.partnerBooking.status !== 'canceled' : true;
}

/** The lead may invite a partner: their confirmed booking, before it starts, not a visit or a partner's part, none in play. */
export function canInviteTeam(booking: LeadBookingFacts, inPlay: boolean, now: Date): boolean {
  return booking.status === 'confirmed' && booking.startAt > now && !booking.seriesId && !booking.teamPartOf && !inPlay;
}

export type PartnerRefusal = 'self' | 'not_bookable' | 'blocked';

/**
 * Whom the lead can bring: someone other than themselves and the client, a helper bookable for the task's category in
 * its market (verified, active, offering it), with no block between the partner and the lead or the client.
 */
export function partnerRefusal(input: { partnerId: string; leadId: string; clientId: string; bookable: boolean; blocked: boolean }): PartnerRefusal | null {
  if (input.partnerId === input.leadId || input.partnerId === input.clientId) return 'self';
  if (!input.bookable) return 'not_bookable';
  if (input.blocked) return 'blocked';
  return null;
}

/** What the viewer can do on the invite now, from its status (never the UI's guess). */
export function teamActions(team: TeamFacts, role: TeamViewerRole, now: Date): TeamActionId[] {
  const status = teamStatusNow(team, now);
  const unbooked = status === 'confirmed' && !team.partnerBooking;
  switch (role) {
    case 'partner':
      if (status === 'invited') return ['accept', 'decline'];
      return status === 'accepted' || unbooked ? ['withdraw'] : [];
    case 'lead':
      // Until the partner's part is booked (sweep B7: a confirmed part never booked held the lead's one place).
      return status === 'invited' || status === 'accepted' || unbooked ? ['cancel'] : [];
    case 'client':
      if (status === 'accepted') return ['confirm', 'refuse'];
      // A confirmed part not booked yet: book it, or say no after all (sweep B7: closing the checkout left no way out).
      return unbooked && team.offerOpen !== false ? ['book', 'refuse'] : [];
  }
}

/**
 * Money is role-projected: the partner's price shows to the partner and the client always, and to the lead only while
 * they're asking (it's their proposal); once confirmed, each helper sees the other's name and role only.
 */
export function showsPartnerPrice(role: TeamViewerRole, status: TeamStatus): boolean {
  return role !== 'lead' || status === 'invited' || status === 'accepted';
}

/**
 * The client's choice on the lead's canceled booking: keep the partner or cancel their booking too (normal cancel
 * rules), while the partner's booking can still be canceled before the work and the client hasn't chosen to keep them.
 */
export function cancelChoiceOpen(leadStatus: string, partnerBookingStatus: string | undefined, kept: boolean): boolean {
  return leadStatus === 'canceled' && partnerBookingStatus !== undefined && BEFORE_WORK.includes(partnerBookingStatus) && !kept;
}
