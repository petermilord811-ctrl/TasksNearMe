import type { Cents, ISODateTime } from './common';

/** Booking timeline entries. The UI maps `type` (+ params) to copy: messages key `timeline.<type>`. */
export const TIMELINE_EVENT_TYPES = [
  'task_posted',
  'offer_received',
  'offer_updated',
  'invite_sent',
  'booked',
  'payment_succeeded',
  /** The helper's side of a payment (audit M26): the client paid, and the helper's own earnings are held until approval. */
  'payment_held',
  'payment_failed',
  'change_proposed',
  'change_applied',
  'change_declined',
  'on_my_way',
  'running_late',
  'arrived',
  'cant_access',
  'completion_submitted',
  'evidence_added',
  'approved',
  'auto_approved',
  /** The client tipped the helper after approval (UI-057). */
  'tip_added',
  'problem_reported',
  'rework_offered',
  'settlement_offered',
  'settled',
  'canceled',
  'refund_issued',
  'earnings_transferred',
  'payout_paid',
  'review_submitted',
  'reviews_published',
  'support_note',
  /**
   * A conversation's note when someone writes to a sample profile of the demo marketplace (2026-11-23): it shows how the
   * app works and won't reply. Only where sample rows are told apart (production).
   */
  'sample_profile_notice',
  /** A client asked the helper they're talking to for an offer on one of their tasks (2026-11-23); `params.taskId`. */
  'offer_requested',
  /** The client answered "Couldn't get in": they're there (`im_here`, 2026-11-24). */
  'client_present',
  /** A helper shared open times in the conversation (2026-11-24); `params.slotIds`. */
  'times_shared',
  /** The client sent the helper a thank-you note (2026-11-24); `params.noteId`. Its card shows in the conversation. */
  'thanks_sent',
  /** The client let a family member follow the booking (2026-11-24); `params.name`: the follower's display name. */
  'follower_added',
  /** The client removed a follower (`params.name`). */
  'follower_removed',
  /** A follower stopped following (`params.name`). */
  'follower_left',
  /**
   * Team up (2026-11-24): the lead invited a partner (`team_invited`, in the lead and partner's conversation) and the
   * partner said yes (`team_proposed`, in the lead's booking conversation, for the client); `params.teamId`. Each shows
   * as the team's card.
   */
  'team_invited',
  'team_proposed',
  /**
   * One of a team job's bookings was canceled (2026-11-24, sweep B5), in the two helpers' conversation; `params.name`:
   * whose booking (the lead's, `team_lead_canceled`, or the partner's, `team_partner_canceled`), `params.teamId`.
   */
  'team_lead_canceled',
  'team_partner_canceled',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type TimelineActor = 'poster' | 'helper' | 'support' | 'system';

export interface TimelineEvent {
  id: string;
  at: ISODateTime;
  actor: TimelineActor;
  /** Display name of the actor when it's a person ("Maya R.", "Support"). */
  actorName?: string;
  type: TimelineEventType;
  params?: {
    amountCents?: Cents;
    minutes?: number;
    hours?: number;
    at?: ISODateTime;
    /** A conversation's card (2026-11-23): the task request (`invite_sent`) or the booking change (`change_proposed`) it shows. */
    inviteId?: string;
    changeId?: string;
    /** "Asked for an offer" (`offer_requested`): the task. */
    taskId?: string;
    /** "Shared open times" (`times_shared`): the helper's slots. */
    slotIds?: string[];
    /** A thank-you note (`thanks_sent`). */
    noteId?: string;
    /** A family follower's display name (`follower_added`, `follower_removed`, `follower_left`), or a team helper's whose booking was canceled (`team_lead_canceled`, `team_partner_canceled`). */
    name?: string;
    /** A team invite (`team_invited`, `team_proposed`). */
    teamId?: string;
  };
}
