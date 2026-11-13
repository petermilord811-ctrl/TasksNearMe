import { eq } from 'drizzle-orm';
import type { ActionResult, EmailUnsubscribePageData } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { isLockedPreference, preferenceOn } from './delivery-domain';
import { notificationPreferences } from './schema';
import { saveNotificationPreference } from './service';
import { readUnsubscribeToken } from './unsubscribe';

/** The unsubscribe page for a link: ask first, already done, locked, or a link that doesn't work. */
export async function getUnsubscribePage(db: Db, token: unknown): Promise<EmailUnsubscribePageData> {
  const read = readUnsubscribeToken(token);
  if (!read) return { state: 'invalid' };
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, read.userId)).limit(1);
  if (!user) return { state: 'invalid' };
  if (isLockedPreference(read.topic, 'email')) return { state: 'locked', topic: read.topic };
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, read.userId));
  const stored = new Map(rows.map((row) => [`${row.topic}:${row.channel}`, row.enabled === 'true']));
  return { state: preferenceOn(stored, read.topic, 'email') ? 'confirm' : 'unsubscribed', topic: read.topic };
}

/** Turns the link's topic emails off (or back on). ok `updated`; `not_allowed` for a bad link or a locked topic. */
export async function setEmailsByToken(db: Db, token: unknown, enabled: boolean, now: Date): Promise<ActionResult> {
  const read = readUnsubscribeToken(token);
  if (!read || isLockedPreference(read.topic, 'email')) return { ok: false, code: 'not_allowed' };
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, read.userId)).limit(1);
  if (!user) return { ok: false, code: 'not_allowed' };
  return saveNotificationPreference(db, read.userId, { topic: read.topic, channel: 'email', enabled }, now);
}
