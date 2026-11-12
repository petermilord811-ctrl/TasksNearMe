/**
 * Every action id the app can return in an ActionDescriptor. The UI must have a label for each
 * (messages key `actions.<id>`), and a test checks that none is missing.
 * Rules for when each one is available: docs/ui/ui-contract.md §6 and docs/blueprint/03-state-machines.md.
 */

export const BOOKING_ACTION_IDS = [
  'pay',
  'message',
  'view_address',
  'add_to_calendar',
  'on_my_way',
  'running_late',
  'arrived',
  'propose_change',
  'accept_change',
  'decline_change',
  'withdraw_change',
  'pay_change_difference',
  'cancel',
  'report_no_show',
  'contest_no_show',
  'cant_access',
  'im_here',
  'call_it_off',
  'submit_completion',
  'add_evidence',
  'approve',
  'report_problem',
  'offer_rework',
  'offer_settlement',
  'accept_settlement',
  'decline_settlement',
  'review',
  'save_helper',
  'book_again',
  'offer_rebook',
  'find_replacement',
  'report_damage',
  'safety_report',
  'contact_support',
] as const;
export type BookingActionId = (typeof BOOKING_ACTION_IDS)[number];

export const STAFF_BOOKING_ACTION_IDS = [
  'staff_cancel_override',
  'staff_extend_timer',
  'staff_approve_on_behalf',
  'staff_refund',
  'staff_hold_transfer',
  'staff_release_transfer',
  'staff_reverse_transfer',
  'staff_reveal_address',
  'staff_view_messages',
] as const;
export type StaffBookingActionId = (typeof STAFF_BOOKING_ACTION_IDS)[number];

export const OFFER_ACTION_IDS = [
  'book_offer',
  'decline_offer',
  'message_helper',
  'revise_offer',
  'withdraw_offer',
  'reconfirm_offer',
  /** The helper messages the client about their offer (the offer thread). */
  'message_poster',
] as const;
export type OfferActionId = (typeof OFFER_ACTION_IDS)[number];

/** What a poster can do with their own task (blueprint 03 §2). */
export const TASK_ACTION_IDS = ['cancel_task', 'edit_task', 'invite_helpers', 'post_again'] as const;
export type TaskActionId = (typeof TASK_ACTION_IDS)[number];

export const INVITE_ACTION_IDS = [
  'accept_invite',
  'decline_invite',
  'counter_invite',
  'cancel_invite',
  'accept_counter',
  'decline_counter',
] as const;
export type InviteActionId = (typeof INVITE_ACTION_IDS)[number];

/** A helper's own availability post (UI-029). */
export const AVAILABILITY_ACTION_IDS = ['cancel_post'] as const;
export type AvailabilityActionId = (typeof AVAILABILITY_ACTION_IDS)[number];

/** A row on the helper's My clients (UI-032). */
export const CLIENT_ACTION_IDS = ['propose_rebook'] as const;
export type ClientActionId = (typeof CLIENT_ACTION_IDS)[number];

/** A rebooking proposal: the client accepts (pays) or declines; the helper withdraws (UI-032). */
export const REBOOK_ACTION_IDS = ['accept_proposal', 'decline_proposal', 'withdraw_proposal'] as const;
export type RebookActionId = (typeof REBOOK_ACTION_IDS)[number];

export const REWARD_ACTION_IDS = [
  'redeem',
  'open_gift_card',
  'approve_review',
  'reject_review',
  'void',
  'reissue',
  'reinstate',
] as const;
export type RewardActionId = (typeof REWARD_ACTION_IDS)[number];

export const ALL_ACTION_IDS = [
  ...BOOKING_ACTION_IDS,
  ...STAFF_BOOKING_ACTION_IDS,
  ...OFFER_ACTION_IDS,
  ...TASK_ACTION_IDS,
  ...INVITE_ACTION_IDS,
  ...AVAILABILITY_ACTION_IDS,
  ...CLIENT_ACTION_IDS,
  ...REBOOK_ACTION_IDS,
  ...REWARD_ACTION_IDS,
] as const;
export type AnyActionId = (typeof ALL_ACTION_IDS)[number];
