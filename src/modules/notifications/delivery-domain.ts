import { NOTIFICATION_CHANNELS, type CancelReceiptMoney, type NotificationChannel, type NotificationTopic, type NotificationType, type TimeZone } from '@/contracts';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * Where a notification goes besides the app (backlog B-028, blueprint 10 §3.2 T-29): email and text
 * messages by the person's preferences per topic, with quiet hours for texts that can wait. Pure rules;
 * `delivery.ts` sends.
 */

/** The preference topic of each notification type (the account page's rows). */
export const NOTIFICATION_TOPIC: Record<NotificationType, NotificationTopic> = {
  offer_received: 'offers',
  offer_updated: 'offers',
  offer_declined: 'offers',
  task_canceled: 'offers',
  task_expired: 'offers',
  booking_confirmed: 'bookings',
  booking_canceled: 'bookings',
  booking_canceled_receipt: 'bookings',
  helper_on_the_way: 'bookings',
  helper_running_late: 'bookings',
  helper_arrived: 'bookings',
  cant_access: 'bookings',
  work_submitted: 'bookings',
  work_approved: 'bookings',
  problem_reported: 'bookings',
  earnings_transferred: 'payments',
  payout_paid: 'payments',
  tip_received: 'payments',
  review_published: 'bookings',
  message_received: 'messages',
  support_replied: 'messages',
  case_resolved: 'bookings',
  change_proposed: 'bookings',
  change_applied: 'bookings',
  invite_received: 'offers',
  invite_countered: 'offers',
  invite_accepted: 'bookings',
  rebook_proposed: 'offers',
  rebook_accepted: 'bookings',
  rebook_declined: 'offers',
  task_reopened: 'offers',
  approval_reminder: 'bookings',
  booking_reminder: 'bookings',
  verification_passed: 'account',
  verification_action_needed: 'account',
  background_check_expiring: 'account',
  id_expiring: 'account',
  helper_ready: 'account',
  city_open: 'account',
  badge_earned: 'tips_and_news',
  // A gift card is money-like and once in a lifetime: told like the account's verification news (email always on).
  reward_earned: 'account',
  reward_ready: 'account',
  task_match: 'task_alerts',
  data_export_ready: 'account',
  series_started: 'bookings',
  series_visit_skipped: 'bookings',
  series_paused: 'bookings',
  series_resumed: 'bookings',
  series_stopped: 'bookings',
  scheduled_payment_failed: 'payments',
  replacement_needed: 'task_alerts',
  replacement_search_started: 'bookings',
  // The community (completion plan 7.7): in the app and on devices; email and texts only if the person turns them on.
  community_reply: 'community',
  community_answer_pinned: 'community',
  community_helpful: 'community',
  // Questions on a task (completion plan 7.9) are part of getting to an offer.
  question_received: 'offers',
  question_answered: 'offers',
  // Saved searches (completion plan 7.10) are new-task alerts the person asked for.
  saved_search_match: 'task_alerts',
  saved_search_digest: 'task_alerts',
  // Asking for a review is part of the booking (blueprint 02 J8): in the app and by email (sweep RV4).
  review_prompt: 'bookings',
  review_reminder: 'bookings',
};

/**
 * Types that go by email only: never in the bell (made read, and left out of the notifications page) and never as a text
 * or a push. The cancellation receipt (the owner's choice, 2026-11-20): the person did it on screen, so it's a record.
 */
export const EMAIL_ONLY_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>(['booking_canceled_receipt']);

/**
 * What a cancellation receipt says about the money, for the person who canceled (`by`): from the event's refund and
 * compensation, and whether the booking was ever paid (`confirmed_at`). No line when there's nothing to say.
 */
export function cancelReceiptMoney(by: 'poster' | 'helper', event: { reason?: string; refundCents?: number; compensationCents?: number; paid: boolean }): { money?: CancelReceiptMoney; amountCents?: number } {
  const { refundCents, compensationCents = 0 } = event;
  if (by === 'poster') {
    if (!event.paid) return { money: 'not_charged' };
    // An event that doesn't say: nothing said, rather than a wrong "no refund".
    if (refundCents === undefined) return {};
    if (refundCents <= 0) return { money: 'no_refund' };
    return { money: event.reason === 'poster_late' ? 'late_refund' : 'refund', amountCents: refundCents };
  }
  if (compensationCents > 0) return { money: 'compensation', amountCents: compensationCents };
  if (!event.paid) return { money: 'client_not_charged' };
  return refundCents !== undefined && refundCents > 0 ? { money: 'client_refunded', amountCents: refundCents } : {};
}

/** Day-of updates that can't wait until morning (a 7 am start's 2 h reminder comes at 5 am): texted even in quiet hours. */
export const URGENT_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'helper_on_the_way',
  'helper_running_late',
  'helper_arrived',
  'cant_access',
  'booking_canceled',
  'booking_reminder',
]);

/** Receipts and safety messages always go by email. */
export const LOCKED_PREFERENCES: readonly { topic: NotificationTopic; channel: NotificationChannel }[] = [
  { topic: 'bookings', channel: 'email' },
  { topic: 'payments', channel: 'email' },
  { topic: 'account', channel: 'email' },
];

/** What a person gets before changing anything. */
export const DEFAULT_PREFERENCES: Record<NotificationTopic, readonly NotificationChannel[]> = {
  bookings: ['email', 'sms'],
  messages: ['email'],
  offers: ['email'],
  payments: ['email'],
  account: ['email'],
  task_alerts: ['email'],
  community: [],
  tips_and_news: [],
};

export const isLockedPreference = (topic: string, channel: string) => LOCKED_PREFERENCES.some((item) => item.topic === topic && item.channel === channel);

/** On or off for one topic and channel: locked ones are on; a stored choice wins over the default. */
export function preferenceOn(stored: ReadonlyMap<string, boolean>, topic: NotificationTopic, channel: NotificationChannel): boolean {
  if (isLockedPreference(topic, channel)) return true;
  return stored.get(`${topic}:${channel}`) ?? DEFAULT_PREFERENCES[topic].includes(channel);
}

/** Texts that can wait aren't sent between 9 pm and 8 am in the recipient's market (their own clock). */
export const QUIET_HOURS = { from: 21, until: 8 } as const;

function nextDayKey(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/** When quiet hours end, if `now` is inside them (8 am in the recipient's market zone, daylight saving included). */
export function quietHoursEnd(now: Date, timeZone: TimeZone): Date | null {
  const hour = Number(marketClockTime(now, timeZone).slice(0, 2));
  if (hour >= QUIET_HOURS.until && hour < QUIET_HOURS.from) return null;
  const today = marketDayKey(now, timeZone);
  const day = hour >= QUIET_HOURS.from ? nextDayKey(today) : today;
  return new Date(marketLocalToUtc(day, `${String(QUIET_HOURS.until).padStart(2, '0')}:00`, timeZone));
}

/**
 * Where deliveries go: the preference channels (email, texts), and push to the person's devices. Push is
 * one switch per device ("Notifications on this device"), on for every topic but tips and news.
 */
export type DeliveryChannel = NotificationChannel | 'push';
export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = [...NOTIFICATION_CHANNELS, 'push'];
export const pushOn = (topic: NotificationTopic) => topic !== 'tips_and_news';
/** The channels a type goes by. */
export const channelsFor = (type: NotificationType): readonly DeliveryChannel[] => (EMAIL_ONLY_TYPES.has(type) ? ['email'] : DELIVERY_CHANNELS);

export type DeliveryPlan =
  | { action: 'send' }
  | { action: 'hold'; until: Date }
  | { action: 'skip'; reason: 'preference_off' | 'no_email' | 'no_verified_phone' | 'no_device' | 'email_suppressed' | StaleReason };

/** A message notification that's no longer news (sweep MN9): the conversation was read, or one of the two blocked the other. */
export type StaleReason = 'already_read' | 'blocked';

export const missingAddressReason = (channel: DeliveryChannel) => (channel === 'sms' ? 'no_verified_phone' : channel === 'push' ? 'no_device' : 'no_email');

/** What to do with one notification on one channel now. */
export function planDelivery(input: {
  type: NotificationType;
  channel: DeliveryChannel;
  enabled: boolean;
  hasAddress: boolean;
  /** The email address bounced or complained (email_suppressions): nothing more goes to it. */
  suppressed?: boolean;
  /** A message notification that's no longer news: nothing of it goes out. */
  stale?: StaleReason;
  now: Date;
  /** The recipient's market zone (their home market), for quiet hours. */
  timeZone: TimeZone;
}): DeliveryPlan {
  if (!input.enabled) return { action: 'skip', reason: 'preference_off' };
  if (!input.hasAddress) return { action: 'skip', reason: missingAddressReason(input.channel) };
  if (input.channel === 'email' && input.suppressed) return { action: 'skip', reason: 'email_suppressed' };
  if (input.stale) return { action: 'skip', reason: input.stale };
  // Texts and pushes that can wait don't buzz anyone at night.
  if (input.channel !== 'email' && !URGENT_TYPES.has(input.type)) {
    const until = quietHoursEnd(input.now, input.timeZone);
    if (until) return { action: 'hold', until };
  }
  return { action: 'send' };
}

/** Failed sends are retried 5, 30 and 120 minutes later; then they stay failed for support to see. */
export const RETRY_MINUTES = [5, 30, 120] as const;
