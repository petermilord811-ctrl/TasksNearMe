import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NotificationTopic } from '@/contracts';
import { NOTIFICATION_TOPICS } from '@/contracts';

/**
 * Unsubscribing from one topic's emails with the link in the email itself (no sign-in): the link carries the
 * person and the topic, signed with the app secret. A mail app's one-click unsubscribe (RFC 8058) posts to
 * the same link; the page asks first, so link scanners never unsubscribe anyone. Receipts and safety emails
 * (bookings and payments) can't be turned off.
 *
 * A link works for a year from the day it was sent (the day is signed into it), so an old email still works but a
 * leaked link stops eventually. Links sent before dates were added work until LEGACY_LINKS_UNTIL.
 */

const secret = (env: Record<string, string | undefined> = process.env) => env.BETTER_AUTH_SECRET ?? 'dev-only-secret';

const DAY_MS = 24 * 60 * 60 * 1000;
export const UNSUBSCRIBE_LINK_DAYS = 365;
/** Links without a date (sent before 2026-11-13) keep working for a year from then. */
export const LEGACY_LINKS_UNTIL = new Date('2027-11-13T00:00:00.000Z');

function signature(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url').slice(0, 32);
}

const dayOf = (at: Date) => Math.floor(at.getTime() / DAY_MS);

export function unsubscribeToken(userId: string, topic: NotificationTopic, key = secret(), now: Date = new Date()): string {
  const day = dayOf(now).toString(36);
  return `${userId}.${topic}.${day}.${signature(`unsubscribe:${userId}:${topic}:${day}`, key)}`;
}

function sameSignature(given: string, expected: string): boolean {
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function readUnsubscribeToken(token: unknown, key = secret(), now: Date = new Date()): { userId: string; topic: NotificationTopic } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3 && parts.length !== 4) return null;
  const [userId, topic] = parts as [string, string];
  if (!userId || !(NOTIFICATION_TOPICS as readonly string[]).includes(topic)) return null;
  if (parts.length === 3) {
    // A link from before dates were signed in.
    if (now >= LEGACY_LINKS_UNTIL || !sameSignature(parts[2]!, signature(`unsubscribe:${userId}:${topic}`, key))) return null;
    return { userId, topic: topic as NotificationTopic };
  }
  const [, , day, given] = parts as [string, string, string, string];
  if (!/^[0-9a-z]{1,8}$/.test(day) || !sameSignature(given, signature(`unsubscribe:${userId}:${topic}:${day}`, key))) return null;
  const age = dayOf(now) - parseInt(day, 36);
  // Issued more than a year ago, or (by more than a day) in the future: no longer works.
  if (age > UNSUBSCRIBE_LINK_DAYS || age < -1) return null;
  return { userId, topic: topic as NotificationTopic };
}

/** Where a person turns one topic's emails off. */
export function unsubscribePageUrl(appUrl: string, userId: string, topic: NotificationTopic): string {
  return `${appUrl}/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId, topic))}`;
}

/** What mail apps post to for one-click unsubscribe (the `List-Unsubscribe` header). */
export function oneClickUnsubscribeUrl(appUrl: string, userId: string, topic: NotificationTopic): string {
  return `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId, topic))}`;
}
