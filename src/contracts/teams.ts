import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { ISODateTime, Photo, TimeZone } from './common';
import { invitePricingSchema } from './invites';
import type { PaymentMode, PricingInput } from './money';

// ---- Team up (2026-11-24, owner's chat ideas: "Team up: a helper brings a second helper onto a two-person job like
// moving, with one shared chat with the client"; "implement others all one by one") ----------------------------------
//
// A team job is two linked bookings, nothing new in money or the booking states (blueprint 03 "Team jobs"). The lead
// helper of a confirmed booking invites one partner by @username with a price for the partner's part; the partner
// accepts; the client confirms in the lead's booking conversation, and books the partner through the normal booking
// and payment flow (the offer's confirm dialog), in the lead's payment mode. Each booking keeps its own state, money,
// completion and review. Each helper sees the other's name and role only.

/**
 * A team invite: `invited` (waiting on the partner) → `accepted` (waiting on the client) → `confirmed` (the client said
 * yes: the partner's part is ready to book, and booked once its booking exists). Ends: `declined` (the partner said
 * no), `withdrawn` (the partner stepped back before it was booked), `canceled` (the lead took it back), `refused` (the
 * client said no), `expired` (the lead's booking started or isn't confirmed any more).
 */
export const TEAM_STATUSES = ['invited', 'accepted', 'confirmed', 'declined', 'withdrawn', 'canceled', 'refused', 'expired'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];
/** An invite still in play: the lead can't start another meanwhile. */
export const OPEN_TEAM_STATUSES: readonly TeamStatus[] = ['invited', 'accepted'];

/** Who the viewer is on a team job: the client, the lead helper, or the partner they brought. */
export type TeamViewerRole = 'client' | 'lead' | 'partner';

/**
 * What a person can do on a team invite (from the domain, never the UI): the partner `accept`s or `decline`s, and may
 * `withdraw` until it's booked; the lead may `cancel` until the partner's part is booked; the client `confirm`s or
 * `refuse`s, and `book`s a confirmed part not booked yet (the confirm dialog, `TeamInviteCard.bookHref`) or `refuse`s it
 * after all. A second `confirm` on a part already made opens the same confirm dialog.
 */
export const TEAM_ACTION_IDS = ['accept', 'decline', 'withdraw', 'cancel', 'confirm', 'refuse', 'book'] as const;
export type TeamActionId = (typeof TEAM_ACTION_IDS)[number];

/** One person on a team: name and photo only (never their money, contact details or booking). */
export interface TeamMember {
  displayName: string;
  initials: string;
  photo?: Photo;
  username?: string;
}

/** The partner's booking, as the client sees it (its own page): booked or not, and how it stands. */
export interface TeamPartnerBooking {
  bookingId: string;
  status: string;
}

/**
 * A team invite as one of its three people sees it, in a conversation (as a card) and on the booking page. Money is
 * role-projected: the partner's price shows to the partner (their part), the client (what that part costs them) and the
 * lead only while they're asking (`invited`, `accepted`); never anything of the lead's booking to the partner.
 */
export interface TeamInviteCard {
  teamId: string;
  viewerRole: TeamViewerRole;
  status: TeamStatus;
  lead: TeamMember;
  partner: TeamMember;
  /** The task, its start, and the market's clock to read it on. */
  title: string;
  start: ISODateTime;
  timeZone: TimeZone;
  /** The partner's part (absent for the lead once the client confirmed). */
  pricing?: PricingInput;
  /** How the partner's part is paid: the lead's booking's mode (`direct`, or `held` upfront). */
  paymentMode: PaymentMode;
  /** The lead's note to the partner (lead and partner only). */
  note?: string;
  /** The client's confirmed part not booked yet: the offer's confirm dialog (`routes.app.confirmOffer`). */
  bookHref?: string;
  /** Once booked: the partner's booking (client and partner only). */
  partnerBooking?: TeamPartnerBooking;
  /** The lead's booking was canceled (2026-11-24, sweep B5): the card says so; the partner's booking may go on. */
  leadCanceled?: true;
  actions: TeamActionId[];
}

/**
 * The team on a booking page (`BookingView.team`). On the lead's booking: the lead can invite one partner
 * (`canInvite`); the invite and the partner's booking show as they stand. On the partner's booking: who leads it.
 */
export interface BookingTeamView {
  viewerRole: TeamViewerRole;
  /** This booking is the lead's or the partner's part of the team job. */
  part: 'lead' | 'partner';
  /** The lead can invite a partner now (a confirmed booking, before it starts, none in play). */
  canInvite?: boolean;
  /** The latest invite in play, or the confirmed team. */
  invite?: TeamInviteCard;
  /** The lead's booking (`part: 'partner'`), for the client only: its page. */
  leadBookingId?: string;
  /** The lead's name on the partner's booking. */
  lead?: TeamMember;
  /**
   * The client, on the lead's booking that was canceled while the partner's is still on: keep the partner, or cancel
   * their booking too through the normal cancel sheet (its policy preview first). Gone once they chose.
   */
  cancelChoice?: { partnerBookingId: string; partner: TeamMember };
  /** The lead and partner's own conversation (`routes.app.thread`), for the two helpers. */
  teamThreadId?: string;
  /** On the partner's booking: the lead's booking was canceled (2026-11-24, sweep B5), so nobody leads it now. */
  leadCanceled?: true;
}

/**
 * The team bar in a team job's conversations: "Team: Jordan (lead) and Sam", with a link to each of the viewer's other
 * team conversations (they open in place: the same Messages pane, or the chat window). The client has the lead's and
 * the partner's booking conversations; each helper has their booking conversation and the team conversation.
 */
export interface TeamBar {
  lead: TeamMember;
  partner: TeamMember;
  viewerRole: TeamViewerRole;
  conversations: { kind: 'lead_booking' | 'partner_booking' | 'team'; threadId: string; current: boolean }[];
}

const code = (value: FieldErrorCode) => value;

/** The lead invites a partner by @username, with a price for the partner's part and a short note. */
export const teamInviteInputSchema = z.object({
  username: z.string(code('required')).trim().min(1, code('required')).max(21, code('too_long')),
  pricing: invitePricingSchema,
  note: z.string(code('required')).trim().max(500, code('too_long')).optional(),
});
export type TeamInviteInput = z.input<typeof teamInviteInputSchema>;

/** A team action on one invite. */
export interface TeamActionInput {
  teamId: string;
  action: TeamActionId;
}

/**
 * The client's choice after the lead's booking was canceled: `keep` the partner (their booking goes on as it is). To
 * cancel the partner's booking too, the client uses its normal cancel sheet.
 */
export interface TeamKeepInput {
  teamId: string;
}

/**
 * Team handlers (booking page and conversations).
 * - `onInvite` (the lead, bound to their booking): ok `sent` (the card shows in the team conversation). Errors:
 *   `validation_failed` (`username`: `invalid` for nobody bookable by that name, `prohibited` for themselves or the
 *   client; `pricing`), `not_allowed` (not the lead, not confirmed, started, a team already in play, or blocked),
 *   `rate_limited`, `unknown`.
 * - `onAction`: ok `updated`, or for the client's `confirm` and `book` `redirectTo` the confirm dialog (open it over the
 *   page). Errors: `not_allowed` (not theirs or not now: reload), `expired` (the lead's booking started or ended), `unknown`.
 * - `onKeep` (the client): ok `updated`.
 */
export interface TeamHandlers {
  onInvite?: ActionHandler<TeamInviteInput>;
  onAction: ActionHandler<TeamActionInput>;
  onKeep?: ActionHandler<TeamKeepInput>;
}
