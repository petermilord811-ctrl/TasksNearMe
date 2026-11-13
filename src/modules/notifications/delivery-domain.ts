import type { NotificationChannel, NotificationTopic, NotificationType } from '@/contracts';
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
  booking_confirmed: 'bookings',
  booking_canceled: 'bookings',
  helper_on_the_way: 'bookings',
  helper_running_late: 'bookings',
  helper_arrived: 'bookings',
  cant_access: 'bookings',
  work_submitted: 'bookings',
  work_approved: 'bookings',
  problem_reported: 'bookings',
  earnings_transferred: 'payments',
  payout_paid: 'payments',
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
};

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
];

/** What a person gets before changing anything. */
export const DEFAULT_PREFERENCES: Record<NotificationTopic, readonly NotificationChannel[]> = {
  bookings: ['email', 'sms'],
  messages: ['email'],
  offers: ['email'],
  payments: ['email'],
  tips_and_news: [],
};

export const isLockedPreference = (topic: string, channel: string) => LOCKED_PREFERENCES.some((item) => item.topic === topic && item.channel === channel);

/** On or off for one topic and channel: locked ones are on; a stored choice wins over the default. */
export function preferenceOn(stored: ReadonlyMap<string, boolean>, topic: NotificationTopic, channel: NotificationChannel): boolean {
  if (isLockedPreference(topic, channel)) return true;
  return stored.get(`${topic}:${channel}`) ?? DEFAULT_PREFERENCES[topic].includes(channel);
}

/** Texts that can wait aren't sent between 9 pm and 8 am, market time. */
export const QUIET_HOURS = { from: 21, until: 8 } as const;

function nextDayKey(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/** When quiet hours end, if `now` is inside them (8 am market time, daylight saving included). */
export function quietHoursEnd(now: Date): Date | null {
  const hour = Number(marketClockTime(now).slice(0, 2));
  if (hour >= QUIET_HOURS.until && hour < QUIET_HOURS.from) return null;
  const today = marketDayKey(now);
  const day = hour >= QUIET_HOURS.from ? nextDayKey(today) : today;
  return new Date(marketLocalToUtc(day, `${String(QUIET_HOURS.until).padStart(2, '0')}:00`));
}

export type DeliveryPlan =
  | { action: 'send' }
  | { action: 'hold'; until: Date }
  | { action: 'skip'; reason: 'preference_off' | 'no_email' | 'no_verified_phone' | 'email_suppressed' };

/** What to do with one notification on one channel now. */
export function planDelivery(input: {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  hasAddress: boolean;
  /** The email address bounced or complained (email_suppressions): nothing more goes to it. */
  suppressed?: boolean;
  now: Date;
}): DeliveryPlan {
  if (!input.enabled) return { action: 'skip', reason: 'preference_off' };
  if (!input.hasAddress) return { action: 'skip', reason: input.channel === 'sms' ? 'no_verified_phone' : 'no_email' };
  if (input.channel === 'email' && input.suppressed) return { action: 'skip', reason: 'email_suppressed' };
  if (input.channel === 'sms' && !URGENT_TYPES.has(input.type)) {
    const until = quietHoursEnd(input.now);
    if (until) return { action: 'hold', until };
  }
  return { action: 'send' };
}

/** Failed sends are retried 5, 30 and 120 minutes later; then they stay failed for support to see. */
export const RETRY_MINUTES = [5, 30, 120] as const;
