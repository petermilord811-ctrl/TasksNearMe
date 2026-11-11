import { z } from 'zod';
import type { ActionHandler, ActionResult } from './actions';
import type { Cents, ISODateTime } from './common';
import { personNameField } from './forms';
import type { AttentionTarget } from './home';

/**
 * Notifications and the account page (blueprint 02 §1.2: `/app/notifications`, `/app/account`).
 * Notifications come from what happened on offers, bookings, payments and messages; the account page
 * holds the profile, contact details, notification preferences and privacy requests.
 */

export const NOTIFICATION_TYPES = [
  'offer_received',
  'offer_updated',
  'offer_declined',
  'booking_confirmed',
  'booking_canceled',
  'helper_on_the_way',
  'helper_running_late',
  'helper_arrived',
  'cant_access',
  'work_submitted',
  'work_approved',
  'problem_reported',
  'earnings_transferred',
  'payout_paid',
  'review_published',
  'message_received',
  /** Support wrote to the person on one of their cases (UI-026). */
  'support_replied',
  /** Support resolved a case the person is on (UI-026). */
  'case_resolved',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** The task it's about. */
  title?: string;
  /** Who did it ("Jordan T."). */
  actorName?: string;
  params?: { amountCents?: Cents; minutes?: number };
  /** Where it leads (same targets as the home's attention items). */
  target: AttentionTarget;
  createdAt: ISODateTime;
  readAt?: ISODateTime;
}

/** `/app/notifications`: newest first (the latest 50). */
export interface NotificationsPageData {
  notifications: NotificationView[];
  unreadCount: number;
}

/**
 * - `onMarkAllRead`: ok `updated`.
 * - `onOpen`: marks one read; ok `updated` (the UI then follows the link).
 */
export interface NotificationHandlers {
  onMarkAllRead: () => Promise<ActionResult>;
  onOpen: ActionHandler<{ notificationId: string }>;
}

export const NOTIFICATION_TOPICS = ['bookings', 'messages', 'offers', 'payments', 'tips_and_news'] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];
export const NOTIFICATION_CHANNELS = ['email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface AccountPageData {
  profile: { firstName: string; lastName: string; displayName: string; email: string };
  /** Never the full number. */
  phone?: { last4: string; verified: boolean };
  /** Each topic by channel. Booking and payment emails can't be turned off (they're receipts and safety). */
  preferences: { topic: NotificationTopic; channel: NotificationChannel; enabled: boolean; locked: boolean }[];
  helper: { status: 'none' | 'draft' | 'active' | 'paused' | 'suspended' };
  privacy: { exportRequestedAt?: ISODateTime; deletionRequestedAt?: ISODateTime };
}

export const accountProfileInputSchema = z.object({
  firstName: personNameField(40),
  lastName: personNameField(40),
});
export type AccountProfileInput = z.input<typeof accountProfileInputSchema>;

/**
 * - `onSaveProfile`: ok `saved` (the display name becomes "First L.").
 * - `onSavePreference`: one switch; ok `updated`. Errors: `not_allowed` (a locked one).
 * - `onRequestExport`: ok `submitted` (a copy of the data by email within 30 days).
 * - `onRequestDeletion`: asks first; ok `submitted`. Errors: `not_allowed` (open bookings or money owed).
 * - `onSignOut`: ok with `redirectTo` (the public home).
 */
export interface AccountHandlers {
  onSaveProfile: ActionHandler<AccountProfileInput>;
  onSavePreference: ActionHandler<{ topic: NotificationTopic; channel: NotificationChannel; enabled: boolean }>;
  onRequestExport: () => Promise<ActionResult>;
  onRequestDeletion: () => Promise<ActionResult>;
  onSignOut: () => Promise<ActionResult>;
}
