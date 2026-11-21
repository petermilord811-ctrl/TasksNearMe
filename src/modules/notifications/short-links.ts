import { randomInt } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { localeOrDefault } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { localizedPath } from '@/shared/locale';
import { notificationPath } from './paths';
import { notifications } from './schema';

/**
 * Short links for text messages (messages pass J-M9, ab's decision): a text carries tasksnearme.com/n/<code> in
 * place of the page's address, about 40 characters fewer, so most texts fit one part. Only notification texts get
 * one: their links are plain app paths. A link that carries a token (the "not me" page, an unsubscribe) keeps its
 * full address, so a code never stands in for a token. Emails, pushes and the bell keep their full links too.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_CODE_LENGTH = 10;
const SHORT_CODE = /^[0-9A-Za-z]{10}$/;

/** 10 characters from a CSPRNG, each uniform over base62: about 60 bits. */
export function newShortCode(): string {
  let code = '';
  for (let index = 0; index < SHORT_CODE_LENGTH; index += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export const isShortCode = (value: string): boolean => SHORT_CODE.test(value);

/** The notification's code, made with its first text and kept as long as the notification; one, whoever asks first. */
export async function shortCodeFor(db: Db, notificationId: string): Promise<string> {
  for (let tries = 0; tries < 3; tries += 1) {
    const [current] = await db.select({ shortCode: notifications.shortCode }).from(notifications).where(eq(notifications.id, notificationId)).limit(1);
    if (!current) throw new Error(`No notification ${notificationId}`);
    if (current.shortCode) return current.shortCode;
    try {
      const [set] = await db
        .update(notifications)
        .set({ shortCode: newShortCode() })
        .where(and(eq(notifications.id, notificationId), isNull(notifications.shortCode)))
        .returning({ shortCode: notifications.shortCode });
      if (set?.shortCode) return set.shortCode;
      // Another run gave it one meanwhile: the next pass reads it.
    } catch (error) {
      // A code another notification has (about once in 10^17 draws): draw again.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`Could not give notification ${notificationId} a short code`);
}

/** Where /n/<code> goes: the notification's page in its recipient's language, or null for a code that isn't one. */
export async function shortLinkPath(db: Db, code: string): Promise<string | null> {
  if (!isShortCode(code)) return null;
  const [row] = await db
    .select({ target: notifications.target, locale: users.locale })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.shortCode, code))
    .limit(1);
  return row ? localizedPath(notificationPath(row.target), localeOrDefault(row.locale)) : null;
}
