import type { AccountHandlers, AccountPageData, EmailUnsubscribeHandlers, EmailUnsubscribePageData, NotificationHandlers, NotificationsPageData, NotificationView } from '@/contracts';
import { routes } from '@/contracts';
import { DESK_TIMES } from './timeline';

/** Notifications and the account page (UI-017). Maya's view on Sat, Nov 21, 2026, around midday. */

const desk = 'Assemble a desk (flat-pack, 1 item)';

const deskNotifications: NotificationView[] = [
  { id: 'ntf_submitted', type: 'work_submitted', title: desk, actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_desk' }, createdAt: DESK_TIMES.completionSubmitted },
  { id: 'ntf_arrived', type: 'helper_arrived', title: desk, actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_desk' }, createdAt: DESK_TIMES.arrived },
  { id: 'ntf_late', type: 'helper_running_late', title: desk, actorName: 'Jordan T.', params: { minutes: 10 }, target: { kind: 'booking', bookingId: 'bkg_desk' }, createdAt: '2026-11-21T16:20:00.000Z', readAt: '2026-11-21T16:21:00.000Z' },
  { id: 'ntf_message', type: 'message_received', title: desk, actorName: 'Jordan T.', target: { kind: 'thread', threadId: 'thr_bkg_desk' }, createdAt: '2026-11-17T15:40:00.000Z', readAt: '2026-11-17T16:00:00.000Z' },
  { id: 'ntf_confirmed', type: 'booking_confirmed', title: desk, target: { kind: 'booking', bookingId: 'bkg_desk' }, createdAt: DESK_TIMES.booked, readAt: DESK_TIMES.booked },
  { id: 'ntf_offer', type: 'offer_received', title: desk, actorName: 'Jordan T.', params: { amountCents: 6000 }, target: { kind: 'task', taskId: 'tsk_desk' }, createdAt: DESK_TIMES.jordanOffered, readAt: '2026-11-17T14:00:00.000Z' },
];

export const mayaNotificationsData: NotificationsPageData = { notifications: deskNotifications, unreadCount: 2 };

/** Jordan's side: paid, and a review. */
export const jordanNotificationsData: NotificationsPageData = {
  notifications: [
    { id: 'ntf_paid', type: 'payout_paid', params: { amountCents: 6200 }, target: { kind: 'earnings' }, createdAt: '2026-11-25T15:00:00.000Z' },
    { id: 'ntf_review', type: 'review_published', title: desk, actorName: 'Maya R.', target: { kind: 'booking', bookingId: 'bkg_desk' }, createdAt: '2026-11-22T09:00:00.000Z' },
    { id: 'ntf_transferred', type: 'earnings_transferred', title: desk, params: { amountCents: 5400 }, target: { kind: 'earnings' }, createdAt: DESK_TIMES.approved, readAt: DESK_TIMES.approved },
  ],
  unreadCount: 2,
};

export const notificationsEmptyData: NotificationsPageData = { notifications: [], unreadCount: 0 };

const preferences: AccountPageData['preferences'] = [
  { topic: 'bookings', channel: 'email', enabled: true, locked: true },
  { topic: 'bookings', channel: 'sms', enabled: true, locked: false },
  { topic: 'messages', channel: 'email', enabled: true, locked: false },
  { topic: 'messages', channel: 'sms', enabled: false, locked: false },
  { topic: 'offers', channel: 'email', enabled: true, locked: false },
  { topic: 'offers', channel: 'sms', enabled: false, locked: false },
  { topic: 'payments', channel: 'email', enabled: true, locked: true },
  { topic: 'payments', channel: 'sms', enabled: false, locked: false },
  { topic: 'tips_and_news', channel: 'email', enabled: false, locked: false },
  { topic: 'tips_and_news', channel: 'sms', enabled: false, locked: false },
];

export const mayaAccountData: AccountPageData = {
  profile: { firstName: 'Maya', lastName: 'Rivera', displayName: 'Maya R.', initials: 'MR', email: 'maya@example.test' },
  maxPhotoMegabytes: 10,
  phone: { last4: '0101', verified: true },
  // Maya connected Google; Microsoft is offered too.
  signIn: { email: 'maya@example.test', providers: [{ provider: 'google', connectedAt: '2026-11-02T16:20:00.000Z' }, { provider: 'microsoft' }] },
  preferences,
  helper: { status: 'none' },
  privacy: {},
};

/** The profile photo Jordan added (a square, like every profile photo). */
export const jordanProfilePhoto = { id: 'fil_avatar_jordan', src: '/samples/avatar-jordan.svg', alt: 'Jordan T.', width: 512, height: 512 };

/** Jordan is an active helper with a profile photo; they asked for a copy of their data. */
export const jordanAccountData: AccountPageData = {
  profile: { firstName: 'Jordan', lastName: 'Thompson', displayName: 'Jordan T.', initials: 'JT', email: 'jordan@example.test', photo: jordanProfilePhoto },
  maxPhotoMegabytes: 10,
  phone: { last4: '0201', verified: true },
  // Back from connecting Microsoft.
  signIn: { email: 'jordan@example.test', providers: [{ provider: 'google' }, { provider: 'microsoft', connectedAt: '2026-11-20T17:55:00.000Z' }], notice: { provider: 'microsoft', result: 'connected' } },
  preferences,
  helper: { status: 'active' },
  privacy: { exportRequestedAt: '2026-11-20T18:00:00.000Z' },
};

/** A new account: no phone yet; deletion requested. */
export const newAccountData: AccountPageData = {
  profile: { firstName: 'Ana', lastName: 'Patel', displayName: 'Ana P.', initials: 'AP', email: 'ana@example.test' },
  maxPhotoMegabytes: 10,
  // Only the email code is offered (production without Google or Microsoft keys).
  signIn: { email: 'ana@example.test', providers: [] },
  preferences,
  helper: { status: 'draft' },
  privacy: { deletionRequestedAt: '2026-11-21T10:00:00.000Z' },
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** The code that works in previews' email and phone dialogs. */
export const CHANGE_CODE = '123456';

export const fakeNotificationHandlers: NotificationHandlers = {
  onMarkAllRead: () => wait({ ok: true, code: 'updated' }),
  onOpen: () => wait({ ok: true, code: 'updated' }),
};

export const fakeAccountHandlers: AccountHandlers = {
  onSaveProfile: () => wait({ ok: true, code: 'saved' }),
  onSavePreference: ({ topic, channel }) =>
    wait((topic === 'bookings' || topic === 'payments') && channel === 'email' ? { ok: false, code: 'not_allowed' } : { ok: true, code: 'updated' }),
  onRequestExport: () => wait({ ok: true, code: 'submitted' }),
  onRequestDeletion: () => wait({ ok: true, code: 'submitted' }),
  onSignOut: () => wait({ ok: true, code: 'updated', redirectTo: routes.home() }),
  // The real one returns the provider's page; previews stay put (only the hash changes).
  onConnectSignIn: () => wait({ ok: true, code: 'sent', redirectTo: '#connect-provider' }),
  onDisconnectSignIn: () => wait({ ok: true, code: 'updated' }),
  onUploadPhoto: () => wait({ ok: true, photo: jordanProfilePhoto }, 700),
  onRemovePhoto: () => wait({ ok: true, code: 'updated' }),
  // Previews: `taken@example.test` is another account's; the code is always 123456.
  onStartEmailChange: ({ email }) =>
    wait(
      email.trim().toLowerCase() === 'taken@example.test'
        ? { ok: false, code: 'validation_failed', fieldErrors: { email: ['in_use'] } }
        : { ok: true, code: 'sent' },
    ),
  onConfirmEmailChange: ({ code }) =>
    wait(code === CHANGE_CODE ? { ok: true, code: 'updated' } : { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } }),
  onStartPhoneChange: () => wait({ ok: true, code: 'sent' }),
  onConfirmPhoneChange: ({ code }) =>
    wait(code === CHANGE_CODE ? { ok: true, code: 'updated' } : { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } }),
};

/** The unsubscribe link in a notification email (`/email/unsubscribe`), in each state. */
export const unsubscribePages = {
  confirm: { state: 'confirm', topic: 'offers' },
  unsubscribed: { state: 'unsubscribed', topic: 'messages' },
  locked: { state: 'locked', topic: 'bookings' },
  invalid: { state: 'invalid' },
} satisfies Record<string, EmailUnsubscribePageData>;

export const fakeUnsubscribeHandlers: EmailUnsubscribeHandlers = {
  onUnsubscribe: () => wait({ ok: true, code: 'updated' }),
  onResubscribe: () => wait({ ok: true, code: 'updated' }),
};

/** Back on the account page after each way connecting can end (UI previews). */
export const accountSignInNotices = {
  alreadyUsed: { ...mayaAccountData, signIn: { ...mayaAccountData.signIn, notice: { provider: 'microsoft', result: 'already_used' } } },
  emailUnconfirmed: { ...mayaAccountData, signIn: { ...mayaAccountData.signIn, notice: { provider: 'microsoft', result: 'email_unconfirmed' } } },
  cancelled: { ...mayaAccountData, signIn: { ...mayaAccountData.signIn, notice: { provider: 'microsoft', result: 'cancelled' } } },
} satisfies Record<string, AccountPageData>;

/** Support wrote to Maya about the problem report, then resolved it (UI-026). */
export const supportNotificationsData: NotificationsPageData = {
  notifications: [
    { id: 'ntf_case_resolved', type: 'case_resolved', title: 'Assemble a desk (flat-pack, 1 item)', target: { kind: 'support_case', caseId: 'case_dispute' }, createdAt: '2026-11-24T17:00:00.000Z' },
    { id: 'ntf_support_replied', type: 'support_replied', title: 'Assemble a desk (flat-pack, 1 item)', target: { kind: 'support_case', caseId: 'case_dispute' }, createdAt: '2026-11-23T16:30:00.000Z', readAt: '2026-11-23T18:00:00.000Z' },
  ],
  unreadCount: 1,
};

/** Rebooking proposals (UI-032), Maya's side: Jordan proposed the desk again. */
export const mayaRebookNotificationsData: NotificationsPageData = {
  notifications: [
    { id: 'ntf_rebook_proposed', type: 'rebook_proposed', title: 'Assemble a desk (flat-pack, 1 item)', actorName: 'Jordan T.', target: { kind: 'proposal', proposalId: 'prp_desk' }, createdAt: '2026-12-08T17:00:00.000Z' },
  ],
  unreadCount: 1,
};

/** Jordan's side: Maya accepted and paid; Chris declined the moving proposal. */
export const jordanRebookNotificationsData: NotificationsPageData = {
  notifications: [
    { id: 'ntf_rebook_accepted', type: 'rebook_accepted', title: 'Assemble a desk (flat-pack, 1 item)', actorName: 'Maya R.', target: { kind: 'booking', bookingId: 'bkg_desk_again' }, createdAt: '2026-12-08T18:00:00.000Z' },
    { id: 'ntf_rebook_declined', type: 'rebook_declined', title: 'Help loading a moving truck', actorName: 'Chris D.', target: { kind: 'proposal', proposalId: 'prp_moving' }, createdAt: '2026-12-08T17:30:00.000Z', readAt: '2026-12-08T17:45:00.000Z' },
  ],
  unreadCount: 1,
};
