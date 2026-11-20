import { z } from 'zod';
import type { PasskeyOptionsResult } from './auth';
import type { ActionHandler, ActionResult, QueryHandler } from './actions';
import type { EmailInput, OneTimeCodeInput, PhoneInput, SocialProvider, SocialSignInInput } from './auth';
import type { Cents, ISODateTime, Photo, TimeZone } from './common';
import { APP_LOCALES, type AppLocale } from './locale';
import { emailField, oneTimeCodeField, personNameField } from './forms';
import type { PhotoUploadResult } from './posting';
import type { AttentionTarget } from './home';
import type { VerificationTrack } from './onboarding';
import type { AccountVerification } from './helper-standing';
import type { BadgeCode, OwnBadgesData } from './badges';

/**
 * Notifications and the account page (blueprint 02 §1.2: `/app/notifications`, `/app/account`).
 * Notifications come from what happened on offers, bookings, payments and messages; the account page
 * holds the profile, contact details, notification preferences and privacy requests.
 */

export const NOTIFICATION_TYPES = [
  'offer_received',
  'offer_updated',
  'offer_declined',
  /** A task the helper had an open offer on was canceled (its cancellation declined the offer: sweep D9). */
  'task_canceled',
  /** The poster's task ended with nobody booked (the tasks.expire job, sweep PT6): post it again? */
  'task_expired',
  'booking_confirmed',
  'booking_canceled',
  /**
   * Email only, never in the bell or on a device: the receipt for the person who canceled a booking themselves (the
   * owner's choice, 2026-11-20). What was canceled (`title`, `params.at`), the money (`params.money`, with
   * `params.amountCents`), and that the other person (`actorName`) was told.
   */
  'booking_canceled_receipt',
  'helper_on_the_way',
  'helper_running_late',
  'helper_arrived',
  'cant_access',
  'work_submitted',
  'work_approved',
  'problem_reported',
  'earnings_transferred',
  'payout_paid',
  /** The client tipped the helper on a completed booking (`params.amountCents`; all of it goes to the helper). */
  'tip_received',
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
  /**
   * The ID our team approved runs out in `params.days` (0: its expiry month has ended, so the helper can't
   * be booked until a new ID check passes). A new check is asked for 30 days before (plan 6.3).
   */
  'id_expiring',
  /** Onboarding is done: the helper can send offers. */
  'helper_ready',
  /** A helper who waited for their city: we've opened there (`title`: the city); they choose a neighborhood next. */
  'city_open',
  /** A new task the helper could take, in their area and categories (blueprint 02 J1; at most 3 an hour). */
  'task_match',
  /** The copy of their data they asked for is ready to download on the account page (for `DATA_EXPORT_DAYS`). */
  'data_export_ready',
  /** Regular visits (blueprint 03 §7): the client accepted the helper's schedule and paid the first visit. */
  'series_started',
  /** One visit was skipped (`params.at`: its start; `params.by`: poster, helper, or payment: it wasn't paid in time). */
  'series_visit_skipped',
  /** The client paused regular visits until `params.day`. */
  'series_paused',
  /** Regular visits start again (`params.by`: the client, or `system` on the date they picked). */
  'series_resumed',
  /** Regular visits stopped (`params.by` poster) or end (`params.by` helper; `params.day`: the last visit date). */
  'series_stopped',
  /** A scheduled charge (a regular visit, a booking far ahead) didn't go through: pay by `params.at` to keep it. */
  'scheduled_payment_failed',
  /** A client's booked helper canceled and the task is open again: a helper it suits could take it (replacement matching). */
  'replacement_needed',
  /** The client's helper canceled: their task is open for offers again on its own, and nearby helpers were told. */
  'replacement_search_started',
  /** A new badge, or a higher tier of one (`params.badge`, `params.tier`; completion plan 6.4). In the app only, unless the person turns on tips and news emails. */
  'badge_earned',
  /** The helper's phone, ID and background checks all passed: the welcome gift card (`params.amountCents`) is theirs, on its way after a quick check. */
  'reward_earned',
  /** A gift card reward (`params.amountCents`) is ready: the helper picks their card on the rewards page. */
  'reward_ready',
  /** Someone answered the person's community post (`title`: the post; `actorName`: who; completion plan 7.7). */
  'community_reply',
  /** The post's author (`actorName`) pinned the person's answer on `title` as the one that helped. */
  'community_answer_pinned',
  /** The person's post or answer (`params.on`) on `title` reached `params.count` Helpful (1, 5, then 25). */
  'community_helpful',
  /** A helper (`actorName`) asked a question on the poster's task `title` (completion plan 7.9). */
  'question_received',
  /** The poster (`actorName`) answered the helper's question on `title`. */
  'question_answered',
  /** A new task (`title`) fits the person's saved search `params.search` (completion plan 7.10). */
  'saved_search_match',
  /** The morning digest: `params.count` new tasks fit the saved search `params.search`. */
  'saved_search_digest',
  /** Leave a review (sweep RV4): the booking `title` with `actorName` was completed; sent to both people at completion. */
  'review_prompt',
  /** One reminder, `params.days` before the review window closes, to whoever hasn't reviewed `actorName` for `title` yet. */
  'review_reminder',
  /** The morning digest over several saved searches (sweep SS6): `params.count` new tasks, the most for `params.search`. */
  'saved_searches_digest',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * A cancellation receipt's money line: the client's refund (`late_refund`: part of it, the rest paying the helper for a
 * late cancellation), no refund, nothing charged yet; the helper's view of the client's refund, or what the helper is
 * paid for their time (a client who wasn't there).
 */
export const CANCEL_RECEIPT_MONEY = ['refund', 'late_refund', 'no_refund', 'not_charged', 'client_refunded', 'client_not_charged', 'compensation'] as const;
export type CancelReceiptMoney = (typeof CANCEL_RECEIPT_MONEY)[number];

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** The task it's about. */
  title?: string;
  /** Who did it ("Jordan T."). */
  actorName?: string;
  /** `at` and `day` are on the clock of `timeZone`, the market of the booking or series it's about (completion plan 8.1). */
  params?: { amountCents?: Cents; minutes?: number; hours?: number; days?: number; track?: VerificationTrack; at?: ISODateTime; day?: string; by?: 'poster' | 'helper' | 'payment' | 'system'; badge?: BadgeCode; tier?: number; count?: number; on?: 'post' | 'reply'; search?: string; timeZone?: TimeZone; money?: CancelReceiptMoney };
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
export const NOTIFICATION_TOPICS = ['bookings', 'messages', 'offers', 'task_alerts', 'community', 'payments', 'account', 'tips_and_news'] as const;
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
  /** Passkeys on the account (sign in with the device's lock), newest first. */
  passkeys: { id: string; name: string; createdAt?: ISODateTime; backedUp: boolean }[];
}

export interface AccountPageData {
  /** Where the person's verification stands (completion plan 6.5): every step for helpers; the phone and any ID check for clients. */
  verification?: AccountVerification;
  /** The person's badges and the next ones (completion plan 6.4). */
  badges?: OwnBadgesData;
  /** `photo`: the profile photo, when they added one (a square; helpers' shows on their public profile). */
  profile: { firstName: string; lastName: string; displayName: string; initials: string; email: string; photo?: Photo };
  /** The largest photo the profile photo upload takes. */
  maxPhotoMegabytes: number;
  /** Never the full number. */
  phone?: { last4: string; verified: boolean };
  /**
   * No texts here (no SMS provider, completion plan 9.2): don't ask for a phone or offer to change one (a number
   * verified earlier shows without a button), and `preferences` carry no `sms` rows.
   */
  textsOff?: true;
  signIn: AccountSignInMethods;
  /** Each topic by channel. Booking and payment emails can't be turned off (they're receipts and safety). */
  preferences: { topic: NotificationTopic; channel: NotificationChannel; enabled: boolean; locked: boolean }[];
  helper: { status: 'none' | 'draft' | 'active' | 'paused' | 'suspended' };
  privacy: AccountPrivacyView;
  /** Notifications on this device (Web Push), when push is set up. */
  push?: PushSetup;
  /** The language they use the app in; emails and texts go out in it too. */
  language: AppLocale;
  /**
   * "Show when I'm active" (completion plan 7.1): when on, people they talk to see "Active now" or "Active
   * today" and "Seen"; when off, nobody does, and they don't see anyone else's either (it's mutual).
   */
  activity?: { shown: boolean };
  /**
   * The account's sign-in details are held (completion plan 5.23): someone used the "Not you?" link in a contact
   * change notice, and our team checks the account before anything changes again. Say so, and don't offer to
   * change the email or phone, connect Google or Microsoft, or add a passkey: the server refuses those
   * (`fieldErrors.email` or `fieldErrors.phone`: `held`; `not_allowed` for the sign-in methods). Removing a
   * passkey or a connected sign-in still works, since it only takes a way in away.
   */
  contactChangesHeld?: boolean;
}

/**
 * How long the "Not you?" link in an email or phone change notice works, in days (completion plan 5.23). It undoes
 * the change only within that time.
 */
export const CONTACT_REVERT_DAYS = 7;

/**
 * `routes.contactRevert(token)`: the "Not you?" link in an email or phone change notice, sent to the old address
 * or number and opened without signing in (completion plan 5.23). The page asks first, since mail apps open
 * links to scan them. `ask`: the link can still be used. `invalid`: it was used, has expired, was changed or isn't
 * ours; all four look the same, and the page never says anything about the account.
 */
export interface ContactRevertPageData {
  state: 'ask' | 'invalid';
}

/**
 * `onConfirm` ("This wasn't me"): every device on the account is signed out; the change is undone if nothing newer
 * replaced it; passkeys and Google or Microsoft sign-ins added since about the time of the change are removed, and
 * a deletion of the account asked for since then is withdrawn; the email, phone and ways to sign in are held until
 * our team clears the account; and trust and safety get an urgent case. ok `updated` (show what happens next).
 * Errors: `not_found` (used, expired or not a link of ours: show the `invalid` state, never which), `rate_limited`
 * with `retryAt`, `unknown`.
 */
export interface ContactRevertHandlers {
  onConfirm: () => Promise<ActionResult>;
}

/** The account's language (blueprint 01, P2). */
export const languageInputSchema = z.object({ locale: z.enum(APP_LOCALES) });
export type LanguageInput = z.input<typeof languageInputSchema>;

/**
 * A browser's push subscription (`PushSubscription.toJSON()`), saved to send notifications to that device.
 * Only the big push services' endpoints are taken (src/modules/notifications/push.ts).
 */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{16,44}$/) }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionInputSchema>;

/** Push is set up here: the key browsers subscribe with. Absent where it isn't (the app says so). */
export interface PushSetup {
  publicKey: string;
}

/**
 * - `onSavePushSubscription`: this device gets notifications; ok `updated`. Errors: `validation_failed`
 *   (not a push service we send to), `rate_limited`, `not_allowed`.
 * - `onRemovePushSubscription`: this device stops; ok `updated` (also when it was already gone).
 */
export interface PushHandlers {
  onSavePushSubscription: ActionHandler<PushSubscriptionInput>;
  onRemovePushSubscription: ActionHandler<{ endpoint: string }>;
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
 *   page load). It sends the person back to the account page with `signIn.notice`. Errors: `not_allowed` (also
 *   while `contactChangesHeld`).
 * - `onDisconnectSignIn`: ok `updated` (the email code still works). Errors: `not_found` (not connected).
 */
export interface AccountHandlers extends PushHandlers {
  onSaveProfile: ActionHandler<AccountProfileInput>;
  /** "Show when I'm active" on or off. ok `updated`. */
  onSaveActivity?: ActionHandler<{ shown: boolean }>;
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
   * A 6-digit code to the new address. ok `sent`. `fieldErrors.email`: `invalid`, `unchanged`, `in_use`, `held`
   * (`contactChangesHeld`). `rate_limited` + `retryAt`. Calling it again with the same address sends a new code.
   */
  onStartEmailChange: ActionHandler<EmailInput>;
  /**
   * Switches the account to the new address (the old one gets a notice with a "Not you?" link). ok `updated`.
   * `fieldErrors.code`: `incorrect`, `expired`; `fieldErrors.email`: `in_use`, `held`.
   */
  onConfirmEmailChange: ActionHandler<EmailChangeConfirmInput>;
  /**
   * A 6-digit code by text to the new number. ok `sent`. `fieldErrors.phone`: `invalid`, `not_supported`,
   * `in_use`, `unchanged`, `held`. `rate_limited` + `retryAt` (also when a new code is asked for too soon).
   */
  onStartPhoneChange: ActionHandler<PhoneInput>;
  /**
   * Verifies the new number (the old one gets a text, and the account's email a notice, each with a "Not you?"
   * link). ok `updated`. `fieldErrors.code`: `incorrect`, `expired`; `fieldErrors.phone`: `held`; `rate_limited`
   * after 3 wrong codes.
   */
  onConfirmPhoneChange: ActionHandler<OneTimeCodeInput>;
  /**
   * "Add a passkey": the options start the device's prompt; its answer and a name go to `onAddPasskey` (ok
   * `saved`). `onRemovePasskey`: ok `updated`. Errors: `not_allowed` (also while `contactChangesHeld`, except
   * removing), `unknown`.
   */
  onPasskeyRegistrationOptions?: () => Promise<PasskeyOptionsResult>;
  onAddPasskey?: ActionHandler<{ response: Record<string, unknown>; name: string }>;
  onRemovePasskey?: ActionHandler<{ id: string }>;
  /** The app, emails and texts in this language; this device switches too, so reload after. ok `updated`. Errors: `validation_failed`. */
  onSaveLanguage?: ActionHandler<LanguageInput>;
}
