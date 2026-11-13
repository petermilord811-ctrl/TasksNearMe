import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NotificationTopic } from '@/contracts';
import { NOTIFICATION_TOPICS } from '@/contracts';

/**
 * Unsubscribing from one topic's emails with the link in the email itself (no sign-in): the link carries the
 * person and the topic, signed with the app secret. A mail app's one-click unsubscribe (RFC 8058) posts to
 * the same link; the page asks first, so link scanners never unsubscribe anyone. Receipts and safety emails
 * (bookings and payments) can't be turned off.
 */

const secret = (env: Record<string, string | undefined> = process.env) => env.BETTER_AUTH_SECRET ?? 'dev-only-secret';

function signature(userId: string, topic: string, key: string): string {
  return createHmac('sha256', key).update(`unsubscribe:${userId}:${topic}`).digest('base64url').slice(0, 32);
}

export function unsubscribeToken(userId: string, topic: NotificationTopic, key = secret()): string {
  return `${userId}.${topic}.${signature(userId, topic, key)}`;
}

export function readUnsubscribeToken(token: unknown, key = secret()): { userId: string; topic: NotificationTopic } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, topic, given] = parts as [string, string, string];
  if (!userId || !(NOTIFICATION_TOPICS as readonly string[]).includes(topic)) return null;
  const expected = signature(userId, topic, key);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
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
