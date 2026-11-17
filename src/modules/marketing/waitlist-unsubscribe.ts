import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { routes, type ActionResult, type AppLocale, type WaitlistUnsubscribePageData } from '@/contracts';
import { appSecret } from '@/platform/crypto/app-secret';
import type { Db } from '@/platform/db/connect';
import { localizedPath } from '@/shared/locale';
import { waitlistEntries } from './schema';

/**
 * Turning off the waitlist's emails with the link in one (completion plan 8.3), without signing in: a waitlist entry
 * belongs to an email address, not an account, so the account's unsubscribe links (src/modules/notifications/
 * unsubscribe.ts) can't carry it. The link names the entry, signed with the app secret and the day it was sent, and
 * works for a year, like theirs. A mail app's one-click unsubscribe (RFC 8058) posts to /api/email/waitlist; a
 * browser opening the link gets the page, which asks first, so link scanners never unsubscribe anyone.
 *
 * Unsubscribing keeps the entry (its demand still counts) with `unsubscribed_at` set: nothing more goes to the
 * address, and since joining again keeps the first answer, nobody can sign it back up through the form.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const WAITLIST_LINK_DAYS = 365;
/** Waitlist links start with this, so they never pass for an account's unsubscribe link (or the other way round). */
const KIND = 'w';

const dayOf = (at: Date) => Math.floor(at.getTime() / DAY_MS);

function signature(entryId: string, day: string, key: string): string {
  return createHmac('sha256', key).update(`waitlist-unsubscribe:${entryId}:${day}`).digest('base64url').slice(0, 32);
}

export function waitlistUnsubscribeToken(entryId: string, key = appSecret(), now: Date = new Date()): string {
  const day = dayOf(now).toString(36);
  return `${KIND}.${entryId}.${day}.${signature(entryId, day, key)}`;
}

/** The entry a link is for, or null: not one of ours, changed, or more than a year old. */
export function readWaitlistUnsubscribeToken(token: unknown, key = appSecret(), now: Date = new Date()): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [kind, entryId, day, given] = parts as [string, string, string, string];
  if (kind !== KIND || !/^wl_[0-9a-z]{1,64}$/.test(entryId) || !/^[0-9a-z]{1,8}$/.test(day)) return null;
  const expected = signature(entryId, day, key);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  const age = dayOf(now) - parseInt(day, 36);
  // Issued more than a year ago, or (by more than a day) in the future: no longer works.
  if (age > WAITLIST_LINK_DAYS || age < -1) return null;
  return entryId;
}

/** The page that asks before unsubscribing, in the entry's language. */
export function waitlistUnsubscribePageUrl(appUrl: string, entryId: string, locale: AppLocale, now: Date = new Date()): string {
  return `${appUrl}${localizedPath(routes.waitlistUnsubscribe(waitlistUnsubscribeToken(entryId, appSecret(), now)), locale)}`;
}

/** What mail apps post to for one-click unsubscribe (the `List-Unsubscribe` header). */
export function waitlistOneClickUrl(appUrl: string, entryId: string, now: Date = new Date()): string {
  return `${appUrl}/api/email/waitlist?token=${encodeURIComponent(waitlistUnsubscribeToken(entryId, appSecret(), now))}`;
}

async function entryOf(db: Db, token: unknown) {
  const entryId = readWaitlistUnsubscribeToken(token);
  if (!entryId) return null;
  const [entry] = await db.select({ id: waitlistEntries.id, unsubscribedAt: waitlistEntries.unsubscribedAt }).from(waitlistEntries).where(eq(waitlistEntries.id, entryId)).limit(1);
  return entry ?? null;
}

/** The page for a link: ask first, already unsubscribed, or a link that doesn't work (never whose address it is). */
export async function getWaitlistUnsubscribePage(db: Db, token: unknown): Promise<WaitlistUnsubscribePageData> {
  const entry = await entryOf(db, token);
  if (!entry) return { state: 'invalid' };
  return { state: entry.unsubscribedAt ? 'unsubscribed' : 'confirm' };
}

/** Turns the waitlist's emails off (or back on) for the link's entry. ok `updated`; `not_allowed` for a link that doesn't work. */
export async function setWaitlistEmailsByToken(db: Db, token: unknown, enabled: boolean, now: Date): Promise<ActionResult> {
  const entry = await entryOf(db, token);
  if (!entry) return { ok: false, code: 'not_allowed' };
  // Off keeps the first time it was turned off; on clears it.
  if (enabled || !entry.unsubscribedAt) await db.update(waitlistEntries).set({ unsubscribedAt: enabled ? null : now, updatedAt: now }).where(eq(waitlistEntries.id, entry.id));
  return { ok: true, code: 'updated' };
}
