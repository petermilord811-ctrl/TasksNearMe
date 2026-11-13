import { z } from 'zod';
import type { ActionHandler, ActionResult, QueryHandler } from './actions';
import type { EmailInput, OneTimeCodeInput, PhoneInput, SocialProvider, SocialSignInInput } from './auth';
import type { Cents, ISODateTime, Photo } from './common';
import { emailField, oneTimeCodeField, personNameField } from './forms';
import type { PhotoUploadResult } from './posting';
import type { AttentionTarget } from './home';
import type { VerificationTrack } from './onboarding';

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
  /** A verification step passed (`params.track`): the phone, the ID, the home address, payouts, the background check. */
  'verification_passed',
  /** A verification step needs the person (`params.track`): another try, another document, more information. */
  'verification_action_needed',
  /** The background check runs out in `params.days` (0: it has; in-home categories are paused). */
  'background_check_expiring',
  /** Onboarding is done: the helper can send offers. */
  'helper_ready',
  /** A new task the helper could take, in their area and categories (blueprint 02 J1; at most 3 an hour). */
  'task_match',
  /** The copy of their data they asked for is ready to download on the account page (for `DATA_EXPORT_DAYS`). */
  'data_export_ready',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** The task it's about. */
  title?: string;
  /** Who did it ("Jordan T."). */
  actorName?: string;
  params?: { amountCents?: Cents; minutes?: number; hours?: number; days?: number; track?: VerificationTrack };
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

/** `account`: verification and account notices (email always on, like receipts). */
export const NOTIFICATION_TOPICS = ['bookings', 'messages', 'offers', 'task_alerts', 'payments', 'account', 'tips_and_news'] as const;
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
  /** `photo`: the profile photo, when they added one (a square; helpers' shows on their public profile). */
  profile: { firstName: string; lastName: string; displayName: string; initials: string; email: string; photo?: Photo };
  /** The largest photo the profile photo upload takes. */
  maxPhotoMegabytes: number;
  /** Never the full number. */
  phone?: { last4: string; verified: boolean };
  signIn: AccountSignInMethods;
  /** Each topic by channel. Booking and payment emails can't be turned off (they're receipts and safety). */
  preferences: { topic: NotificationTopic; channel: NotificationChannel; enabled: boolean; locked: boolean }[];
  helper: { status: 'none' | 'draft' | 'active' | 'paused' | 'suspended' };
  privacy: AccountPrivacyView;
}

/** How long a prepared copy of someone's data stays downloadable. */
export const DATA_EXPORT_DAYS = 7;
/** How long a deletion waits after it's asked for, so a change of mind costs nothing. */
export const DELETION_GRACE_DAYS = 7;

/**
 * What keeps a deletion waiting past its date: open bookings (either side), an open support case about the
 * person, or money still on its way to them (earnings not yet paid out).
 */
export const DELETION_BLOCKERS = ['open_bookings', 'open_case', 'money_on_its_way'] as const;
export type DeletionBlocker = (typeof DELETION_BLOCKERS)[number];

/**
 * Privacy requests (blueprint 08 §5; src/modules/privacy). A copy of the data is prepared in the background
 * (usually within minutes), announced by email, and downloadable from `routes.api.dataExport()` until
 * `expiresAt`. A deletion happens at `scheduledFor` (`DELETION_GRACE_DAYS` after the request) unless the
 * person keeps the account; `waitingFor` says what still has to close first.
 */
export interface AccountPrivacyView {
  export?: { status: 'preparing'; requestedAt: ISODateTime } | { status: 'ready'; requestedAt: ISODateTime; expiresAt: ISODateTime };
  deletion?: { requestedAt: ISODateTime; scheduledFor: ISODateTime; waitingFor?: DeletionBlocker };
}

/**
 * `/email/unsubscribe?token=…`: from the link in a notification email, without signing in. The page asks
 * before turning the topic's emails off (link scanners open links). `locked`: receipts and safety emails
 * (bookings and payments) can't be turned off. `invalid`: a link that was changed or isn't ours.
 */
export interface EmailUnsubscribePageData {
  state: 'confirm' | 'unsubscribed' | 'locked' | 'invalid';
  topic?: NotificationTopic;
}

/** Both resolve with ok `updated`; `not_allowed` for a bad link or a locked topic. */
export interface EmailUnsubscribeHandlers {
  onUnsubscribe: () => Promise<ActionResult>;
  onResubscribe: () => Promise<ActionResult>;
}

/** Changing the account's email: the code went to the new address; entering it switches the account to it. */
export const emailChangeConfirmInputSchema = z.object({ email: emailField, code: oneTimeCodeField });
export type EmailChangeConfirmInput = z.input<typeof emailChangeConfirmInputSchema>;

/** How long a change code works, and how soon a new one can be sent (shown in the dialogs). */
export const CONTACT_CODE_MINUTES = 10;

export const accountProfileInputSchema = z.object({
  firstName: personNameField(40),
  lastName: personNameField(40),
});
export type AccountProfileInput = z.input<typeof accountProfileInputSchema>;

/**
 * - `onSaveProfile`: ok `saved` (the display name becomes "First L.").
 * - `onSavePreference`: one switch; ok `updated`. Errors: `not_allowed` (a locked one).
 * - `onRequestExport`: ok `submitted` (prepared in the background; the page shows it once ready).
 * - `onRequestDeletion`: asks first; ok `submitted` (it happens in `DELETION_GRACE_DAYS`). Errors: `not_allowed`
 *   (open bookings: finish or cancel them first).
 * - `onCancelDeletion`: keeps the account; ok `updated`.
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
  onCancelDeletion: () => Promise<ActionResult>;
  onSignOut: () => Promise<ActionResult>;
  onConnectSignIn: ActionHandler<SocialSignInInput>;
  onDisconnectSignIn: ActionHandler<SocialSignInInput>;
  /** FormData with one `file`: the new profile photo (cropped to a square). Resolves with the photo. */
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  /** ok `updated`. */
  onRemovePhoto: () => Promise<ActionResult>;
  /**
   * A 6-digit code to the new address. ok `sent`. `fieldErrors.email`: `invalid`, `unchanged`, `in_use`.
   * `rate_limited` + `retryAt`. Calling it again with the same address sends a new code.
   */
  onStartEmailChange: ActionHandler<EmailInput>;
  /**
   * Switches the account to the new address (the old one gets a notice). ok `updated`.
   * `fieldErrors.code`: `incorrect`, `expired`.
   */
  onConfirmEmailChange: ActionHandler<EmailChangeConfirmInput>;
  /**
   * A 6-digit code by text to the new number. ok `sent`. `fieldErrors.phone`: `invalid`, `not_supported`,
   * `in_use`, `unchanged`. `rate_limited` + `retryAt` (also when a new code is asked for too soon).
   */
  onStartPhoneChange: ActionHandler<PhoneInput>;
  /** Verifies the new number. ok `updated`. `fieldErrors.code`: `incorrect`, `expired`; `rate_limited` after 3 wrong codes. */
  onConfirmPhoneChange: ActionHandler<OneTimeCodeInput>;
}
