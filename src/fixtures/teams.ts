import type { BookingListRow, BookingTeamView, BookingView, BookingsPageData, MessageView, TeamBar, TeamInviteCard, TeamMember, ThreadPageData } from '@/contracts';
import { movingBookingPosterConfirmed } from './bookings';
import { deskBookingThreadPageData } from './messaging';
import { jordan, sam } from './people';

/**
 * Team up (2026-11-24): Chris booked Jordan for his move (paid directly, hourly); Jordan brings Sam for $120 (fixed) for
 * Sam's part. Every state of the invite for each of the three, the booking pages, the bookings list and the team bar.
 */

const member = (person: { displayName: string; initials: string; username?: string }): TeamMember => ({ displayName: person.displayName, initials: person.initials, ...(person.username ? { username: person.username } : {}) });
export const teamLead = member(jordan);
export const teamPartner = member(sam);

const base: TeamInviteCard = {
  teamId: 'tem_moving',
  viewerRole: 'partner',
  status: 'invited',
  lead: teamLead,
  partner: teamPartner,
  title: movingBookingPosterConfirmed.task.title,
  start: movingBookingPosterConfirmed.terms.start,
  timeZone: 'America/Chicago',
  pricing: { type: 'fixed', priceCents: 12000 },
  paymentMode: 'direct',
  note: 'Two flights of stairs. Bring gloves and a dolly if you have one.',
  actions: ['accept', 'decline'],
};

/** Sam's card in the team conversation: accept or decline. */
export const teamCardPartnerInvited: TeamInviteCard = base;
/** Sam after accepting: waiting on Chris; Sam can still step back. */
export const teamCardPartnerAccepted: TeamInviteCard = { ...base, status: 'accepted', actions: ['withdraw'] };
/** Sam once booked: on the team, their booking linked. */
export const teamCardPartnerBooked: TeamInviteCard = { ...base, status: 'confirmed', actions: [], partnerBooking: { bookingId: 'bkg_moving_sam', status: 'confirmed' } };
/** Jordan's card while asking: their proposal's price, and Cancel invite. */
export const teamCardLeadInvited: TeamInviteCard = { ...base, viewerRole: 'lead', actions: ['cancel'] };
/** Jordan once Chris confirmed: names and roles only, no price. */
const { pricing: _leadPrice, ...withoutPrice } = base;
export const teamCardLeadConfirmed: TeamInviteCard = { ...withoutPrice, viewerRole: 'lead', status: 'confirmed', actions: [] };
/** Chris's card in his conversation with Jordan: confirm or not now. */
const { note: _clientNote, ...withoutNote } = base;
export const teamCardClientAccepted: TeamInviteCard = { ...withoutNote, viewerRole: 'client', status: 'accepted', actions: ['confirm', 'refuse'] };
/** Chris confirmed a held part but hasn't paid yet: Book Sam opens the confirm dialog. */
export const teamCardClientBooking: TeamInviteCard = { ...teamCardClientAccepted, status: 'confirmed', paymentMode: 'held', actions: ['book'], bookHref: '/app/tasks/tsk_moving_sam/offers/off_moving_sam/confirm' };
/** Chris once Sam is booked. */
export const teamCardClientBooked: TeamInviteCard = { ...teamCardClientAccepted, status: 'confirmed', actions: [], partnerBooking: { bookingId: 'bkg_moving_sam', status: 'confirmed' } };
/** Ended invites. */
export const teamCardPartnerDeclined: TeamInviteCard = { ...base, viewerRole: 'lead', status: 'declined', actions: [] };
export const teamCardClientRefused: TeamInviteCard = { ...teamCardClientAccepted, status: 'refused', actions: [] };
export const teamCardExpired: TeamInviteCard = { ...base, status: 'expired', actions: [] };
/** The partner's booking was canceled afterwards (by the partner or the client): the lead may invite someone else. */
export const teamCardClientPartnerCanceled: TeamInviteCard = { ...teamCardClientBooked, partnerBooking: { bookingId: 'bkg_moving_sam', status: 'canceled' } };

/** Every invite state, by name, for the previews. */
export const teamCardStates = {
  partnerInvited: teamCardPartnerInvited,
  partnerAccepted: teamCardPartnerAccepted,
  partnerBooked: teamCardPartnerBooked,
  leadInvited: teamCardLeadInvited,
  leadConfirmed: teamCardLeadConfirmed,
  leadDeclined: teamCardPartnerDeclined,
  clientAccepted: teamCardClientAccepted,
  clientBooking: teamCardClientBooking,
  clientBooked: teamCardClientBooked,
  clientRefused: teamCardClientRefused,
  expired: teamCardExpired,
  clientPartnerCanceled: teamCardClientPartnerCanceled,
} as const;

// ---- Booking pages ------------------------------------------------------------------------------------------------

const jordanMoving: BookingView = { ...movingBookingPosterConfirmed, viewerRole: 'helper' };
/** Jordan's booking: "Team up" offered. */
export const teamLeadCanInvite: BookingTeamView = { viewerRole: 'lead', part: 'lead', canInvite: true };
export const movingLeadCanInviteData: BookingView = { ...jordanMoving, team: teamLeadCanInvite };
/** Jordan's booking while Sam is asked. */
export const movingLeadInvitedData: BookingView = { ...jordanMoving, team: { viewerRole: 'lead', part: 'lead', invite: teamCardLeadInvited, teamThreadId: 'thr_team_moving' } };
/** Jordan's booking once Sam is on the team. */
export const movingLeadTeamData: BookingView = { ...jordanMoving, team: { viewerRole: 'lead', part: 'lead', invite: teamCardLeadConfirmed, teamThreadId: 'thr_team_moving' } };
/** Chris's booking with Jordan: confirm Sam. */
export const movingClientConfirmData: BookingView = { ...movingBookingPosterConfirmed, team: { viewerRole: 'client', part: 'lead', invite: teamCardClientAccepted } };
/** Chris's booking with Jordan once Sam is booked. */
export const movingClientTeamData: BookingView = { ...movingBookingPosterConfirmed, team: { viewerRole: 'client', part: 'lead', invite: teamCardClientBooked } };
/** Jordan canceled: Chris keeps Sam or cancels Sam's booking too. */
export const movingClientCancelChoiceData: BookingView = {
  ...movingBookingPosterConfirmed,
  status: 'canceled',
  cancelReason: 'helper',
  actions: [],
  team: { viewerRole: 'client', part: 'lead', invite: teamCardClientBooked, cancelChoice: { partnerBookingId: 'bkg_moving_sam', partner: teamPartner } },
};
/** Sam's own booking: Jordan leads it. */
export const movingPartnerBookingData: BookingView = {
  ...movingBookingPosterConfirmed,
  id: 'bkg_moving_sam',
  viewerRole: 'helper',
  helper: sam,
  terms: { ...movingBookingPosterConfirmed.terms, pricing: { type: 'fixed', priceCents: 12000 } },
  team: { viewerRole: 'partner', part: 'partner', lead: teamLead, teamThreadId: 'thr_team_moving' },
};
/** Chris's view of Sam's booking: part of Jordan's team job. */
export const movingClientPartnerBookingData: BookingView = {
  ...movingBookingPosterConfirmed,
  id: 'bkg_moving_sam',
  helper: sam,
  team: { viewerRole: 'client', part: 'partner', lead: teamLead, leadBookingId: 'bkg_moving' },
};

// ---- Bookings list ------------------------------------------------------------------------------------------------

const teamRow = (view: BookingView, amountCents: number, part: 'lead' | 'partner'): BookingListRow => ({
  id: view.id,
  title: view.task.title,
  categorySlug: view.task.categorySlug,
  status: view.status,
  viewerRole: view.viewerRole,
  otherParty: view.viewerRole === 'poster' ? view.helper : view.poster,
  start: view.terms.start,
  location: view.location,
  amountCents,
  needsAction: false,
  team: { part, lead: jordan.displayName, partner: sam.displayName },
});
/** Chris's list: both parts of the move, each with the team. */
export const chrisTeamBookingsPageData: BookingsPageData = {
  needsAction: [],
  upcoming: [teamRow(movingBookingPosterConfirmed, 14000, 'lead'), teamRow(movingClientPartnerBookingData, 12000, 'partner')],
  past: [],
};

// ---- Conversations ------------------------------------------------------------------------------------------------

const line = (id: string, type: 'team_invited' | 'team_proposed'): MessageView => ({ id, sender: 'system', kind: 'status', segments: [], attachments: [], event: { type, params: { teamId: 'tem_moving' } }, createdAt: '2026-11-24T16:00:00.000Z' });

/** Chris's conversation with Jordan: the team bar, and the card he confirms. */
export const teamBarClient: TeamBar = { lead: teamLead, partner: teamPartner, viewerRole: 'client', conversations: [{ kind: 'lead_booking', threadId: 'thr_bkg_moving', current: true }, { kind: 'partner_booking', threadId: 'thr_bkg_moving_sam', current: false }] };
export const teamBarPartner: TeamBar = { lead: teamLead, partner: teamPartner, viewerRole: 'partner', conversations: [{ kind: 'partner_booking', threadId: 'thr_bkg_moving_sam', current: false }, { kind: 'team', threadId: 'thr_team_moving', current: true }] };
export const teamClientConfirmThreadData: ThreadPageData = {
  ...deskBookingThreadPageData,
  thread: { ...deskBookingThreadPageData.thread, title: movingBookingPosterConfirmed.task.title, otherParty: jordan },
  messages: [...deskBookingThreadPageData.messages, line('msg_team_proposed', 'team_proposed')],
  cards: { teams: { tem_moving: teamCardClientAccepted } },
};
/** Chris once Sam is booked: the bar switches between his two conversations. */
export const teamClientBarThreadData: ThreadPageData = { ...teamClientConfirmThreadData, cards: { teams: { tem_moving: teamCardClientBooked } }, team: teamBarClient };
/** Sam's view of the team conversation with Jordan: the invite card, then the bar. */
export const teamPartnerInviteThreadData: ThreadPageData = {
  ...deskBookingThreadPageData,
  thread: { ...deskBookingThreadPageData.thread, id: 'thr_team_moving', kind: 'direct', title: jordan.displayName, otherParty: jordan, subject: { kind: 'person', helperHandle: 'jordan-t', canRequest: false } },
  messages: [line('msg_team_invited', 'team_invited')],
  cards: { teams: { tem_moving: teamCardPartnerInvited } },
};
export const teamPartnerBarThreadData: ThreadPageData = { ...teamPartnerInviteThreadData, cards: { teams: { tem_moving: teamCardPartnerBooked } }, team: teamBarPartner };
