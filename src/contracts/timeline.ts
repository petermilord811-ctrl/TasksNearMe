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
  };
}
