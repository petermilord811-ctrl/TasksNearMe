import type { Cents, ISODateTime } from './common';

/** Booking timeline entries. The UI maps `type` (+ params) to copy: messages key `timeline.<type>`. */
export const TIMELINE_EVENT_TYPES = [
  'task_posted',
  'offer_received',
  'offer_updated',
  'invite_sent',
  'booked',
  'payment_succeeded',
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
  };
}
