import { z } from 'zod';
import type { ActionHandler, ActionResult } from './actions';
import type { SocialProvider, SocialSignInInput } from './auth';
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
  /** The other person proposed a change to a booking (UI-027). */
  'change_proposed',
  /** A change was applied to a booking (UI-027). */
  'change_applied',
  /** A client invited the helper to a task (UI-025). */
  'invite_received',
  /** The helper countered the client's invite (UI-025). */
  'invite_countered',
  /** The helper accepted the client's invite: booked (UI-025). */
  'invite_accepted',
  /** A helper proposed a booking to a past client (UI-032). */
  'rebook_proposed',
  /** The client accepted (and paid for) the helper's proposal (UI-032). */
  'rebook_accepted',
  /** The client declined the helper's proposal (UI-032). */
  'rebook_declined',
  /** A task the helper offered on is open again: its helper canceled and the client is finding a replacement. */
  'task_reopened',
  /** The client hasn't approved submitted work: it's approved automatically in `params.hours` (24 h and 4 h before). */
  'approval_reminder',
  /** A confirmed booking starts in `params.hours` (24 h and 2 h before; both people). */
  'booking_reminder',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** The task it's about. */
  title?: string;
  /** Who did it ("Jordan T."). */
  actorName?: string;
  params?: { amountCents?: Cents; minutes?: number; hours?: number };
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

/**
 * How it went, back on the account page after connecting Google or Microsoft:
 * - `connected`: done; the next sign-in can use it.
 * - `cancelled`: the person stopped on the provider's page.
 * - `already_used`: that Google or Microsoft account already signs in to another TasksNearMe account.
 * - `email_unconfirmed`: the provider didn't confirm the account's email address (some work accounts).
 * - `failed`: anything else; try again.
 */
export const SIGN_IN_CONNECT_RESULTS = ['connected', 'cancelled', 'already_used', 'email_unconfirmed', 'failed'] as const;
export type SignInConnectResult = (typeof SIGN_IN_CONNECT_RESULTS)[number];

/** Ways to sign in. The email code always works; Google and Microsoft are optional extras. */
export interface AccountSignInMethods {
  /** The account's email: the email code goes there. */
  email: string;
  /** The providers on offer, each connected or not. Empty: only the email code is offered. */
  providers: { provider: SocialProvider; connectedAt?: ISODateTime }[];
  /** After coming back from connecting one. */
  notice?: { provider: SocialProvider; result: SignInConnectResult };
}

export interface AccountPageData {
  profile: { firstName: string; lastName: string; displayName: string; email: string };
  /** Never the full number. */
  phone?: { last4: string; verified: boolean };
  signIn: AccountSignInMethods;
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
 * - `onConnectSignIn`: ok `sent` with `redirectTo`, the provider's page on another site (navigate with a full
 *   page load). It sends the person back to the account page with `signIn.notice`. Errors: `not_allowed`.
 * - `onDisconnectSignIn`: ok `updated` (the email code still works). Errors: `not_found` (not connected).
 */
export interface AccountHandlers {
  onSaveProfile: ActionHandler<AccountProfileInput>;
  onSavePreference: ActionHandler<{ topic: NotificationTopic; channel: NotificationChannel; enabled: boolean }>;
  onRequestExport: () => Promise<ActionResult>;
  onRequestDeletion: () => Promise<ActionResult>;
  onSignOut: () => Promise<ActionResult>;
  onConnectSignIn: ActionHandler<SocialSignInInput>;
  onDisconnectSignIn: ActionHandler<SocialSignInInput>;
}
