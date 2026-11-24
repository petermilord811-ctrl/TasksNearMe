import type { NotificationType, QuietHoursSetting, TimeZone } from '@/contracts';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * A person's own quiet hours (2026-11-24, owner's list): pure rules, shared by delivery (delivery.ts) and the note a
 * sender sees above the message box (messaging/service.ts). Inside them, "sent you a message" notifications reach only
 * the app: no push, text or email, and nothing is sent later in a burst (the unread count and the inbox show them).
 * Messages in a booking's conversation on the booking's day or within the next 12 hours, and every other kind of
 * notification (payments, bookings, changes, safety), go as usual. Times are on the person's home market's clock.
 */

const MINUTE = 60_000;
/** A booking that starts within this long is "soon": its conversation's messages notify as usual. */
export const BOOKING_SOON_MS = 12 * 60 * MINUTE;
const DAY_MINUTES = 24 * 60;

const minutesOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

function nextDayKey(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + 1)).toISOString().slice(0, 10);
}

/**
 * When the person's quiet hours end, if `now` is inside them on their market's clock; null outside them, or when they're
 * off. A window may cross midnight ("21:00" to "08:00"); daylight saving is the market's own (a 2 am that doesn't exist
 * moves forward, a repeated 1 am ends at its second pass).
 */
export function ownQuietHoursEnd(now: Date, quiet: QuietHoursSetting | null | undefined, timeZone: TimeZone): Date | null {
  if (!quiet?.enabled || quiet.startsAt === quiet.endsAt) return null;
  const clock = minutesOf(marketClockTime(now, timeZone));
  const start = minutesOf(quiet.startsAt);
  const end = minutesOf(quiet.endsAt);
  const crossesMidnight = start > end;
  const inside = crossesMidnight ? clock >= start || clock < end : clock >= start && clock < end;
  if (!inside) return null;
  const today = marketDayKey(now, timeZone);
  const endDay = crossesMidnight && clock >= start ? nextDayKey(today) : today;
  const until = new Date(marketLocalToUtc(endDay, quiet.endsAt, timeZone));
  // The repeated hour when clocks fall back: the end's first pass may already be behind; it's the wall-clock wait then.
  if (until.getTime() <= now.getTime()) return new Date(now.getTime() + ((end - clock + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES) * MINUTE);
  return until;
}

/** A booking on the market's today, or starting within the next 12 hours: messages about it can't wait. */
export function bookingIsSoon(startAt: Date, now: Date, timeZone: TimeZone): boolean {
  const ahead = startAt.getTime() - now.getTime();
  if (ahead >= 0 && ahead <= BOOKING_SOON_MS) return true;
  return marketDayKey(startAt, timeZone) === marketDayKey(now, timeZone);
}

/**
 * Whether a notification keeps quiet for the person's own quiet hours, and until when: only a message notification
 * ("sent you a message"), while they're on and it's inside them, and not when its conversation is a booking's that is
 * today or within 12 hours (`bookingStarts`: the conversation's bookings that aren't canceled). Null: it goes as usual.
 */
export function quietUntil(input: { type: NotificationType; now: Date; quiet: QuietHoursSetting | null | undefined; timeZone: TimeZone; bookingStarts?: readonly Date[] }): Date | null {
  if (input.type !== 'message_received') return null;
  const until = ownQuietHoursEnd(input.now, input.quiet, input.timeZone);
  if (!until) return null;
  if (input.bookingStarts?.some((startAt) => bookingIsSoon(startAt, input.now, input.timeZone))) return null;
  return until;
}
