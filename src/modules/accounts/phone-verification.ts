import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createTranslator } from 'next-intl';
import { localeOrDefault } from '@/contracts/locale';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { SmsRejectedError, type SmsSender } from '@/integrations/sms';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimits } from '@/platform/rate-limit';
import { maskUsPhone, normalizeUsPhone } from '@/shared/phone';
import { phoneVerifications, users } from './schema';

/**
 * Phone verification (blueprint 06 §1, backlog B-011): a 6-digit code by text, valid for
 * 10 minutes; three wrong codes lock verification for 10 minutes. The development provider keeps
 * an HMAC of the code in the row; Twilio Verify will keep the code itself.
 */

export const PHONE_CODE_LIFETIME_MS = 10 * 60_000;
export const PHONE_RESEND_AFTER_MS = 30_000;
export const PHONE_MAX_ATTEMPTS = 3;
export const PHONE_LOCK_MS = 10 * 60_000;

const SEND_RULES = {
  perUser: { limit: 3, windowSeconds: 10 * 60 },
  perPhone: { limit: 5, windowSeconds: 24 * 60 * 60 },
};

export type StartResult =
  | { ok: true; maskedPhone: string; resendAvailableAt: Date }
  /**
   * `held`: a "Not you?" link holds the account's phone until staff clear it (completion plan 5.23). `verified`: the
   * account has a verified number, which only the account page's change replaces (`{ change: true }`).
   */
  | { ok: false; reason: 'invalid' | 'not_supported' | 'in_use' | 'held' | 'verified' }
  | { ok: false; reason: 'rate_limited'; retryAt: Date };

export type VerifyResult =
  | { ok: true; phone: string }
  | { ok: false; reason: 'no_pending' | 'incorrect' | 'expired' }
  | { ok: false; reason: 'locked'; retryAt: Date };

export interface PhoneVerificationDeps {
  db: Db;
  sms: SmsSender;
  /** Signs code hashes. */
  secret: string;
  now?: () => Date;
}

/** The code's text message, in the person's language. */
const smsFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.sms' }));

export function createPhoneVerification({ db, sms, secret, now = () => new Date() }: PhoneVerificationDeps) {
  const hashCode = (id: string, code: string) => createHmac('sha256', secret).update(`${id}:${code}`).digest('hex');

  async function latest(userId: string) {
    const [row] = await db
      .select()
      .from(phoneVerifications)
      .where(eq(phoneVerifications.userId, userId))
      .orderBy(desc(phoneVerifications.createdAt))
      .limit(1);
    return row ?? null;
  }

  async function held(userId: string): Promise<boolean> {
    const [row] = await db.select({ at: users.contactHoldAt }).from(users).where(eq(users.id, userId)).limit(1);
    return Boolean(row?.at);
  }

  async function cancelPending(userId: string, at: Date) {
    await db
      .update(phoneVerifications)
      .set({ status: 'canceled', updatedAt: at })
      .where(and(eq(phoneVerifications.userId, userId), eq(phoneVerifications.status, 'pending')));
  }

  return {
    /** The open code, if any: drives the `phone_code` sign-in step. */
    async pending(userId: string): Promise<{ phone: string; maskedPhone: string; resendAvailableAt: Date } | null> {
      const row = await latest(userId);
      if (!row || row.status !== 'pending' || row.expiresAt <= now()) return null;
      return { phone: row.phone, maskedPhone: maskUsPhone(row.phone), resendAvailableAt: row.resendAvailableAt };
    },

    async start(userId: string, phoneInput: string, { change = false }: { change?: boolean } = {}): Promise<StartResult> {
      const at = now();
      // Sign-in's phone step and the account page both come here.
      if (await held(userId)) return { ok: false, reason: 'held' };
      // Sign-in's step is for an account without a verified number. A verified one is replaced only on the account
      // page, which tells the account and the old number, with a "Not you?" link (security review SEC20).
      if (!change) {
        const [account] = await db.select({ verifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
        if (account?.verifiedAt) return { ok: false, reason: 'verified' };
      }
      const phone = normalizeUsPhone(phoneInput);
      if (!phone) return { ok: false, reason: /^\s*\+(?!1)/.test(phoneInput) ? 'not_supported' : 'invalid' };

      const previous = await latest(userId);
      if (previous?.status === 'locked' && previous.lockedUntil && previous.lockedUntil > at) {
        return { ok: false, reason: 'rate_limited', retryAt: previous.lockedUntil };
      }
      if (previous?.status === 'pending' && previous.resendAvailableAt > at) {
        return { ok: false, reason: 'rate_limited', retryAt: previous.resendAvailableAt };
      }

      const limited = await consumeRateLimits(
        db,
        [
          { key: `phone-send:user:${userId}`, rule: SEND_RULES.perUser },
          { key: `phone-send:phone:${phone}`, rule: SEND_RULES.perPhone },
        ],
        at,
      );
      if (!limited.ok) return { ok: false, reason: 'rate_limited', retryAt: limited.retryAt };

      // Counted first: whether another account uses a number can't be asked faster than texts are sent (SEC20).
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, phone), ne(users.id, userId)))
        .limit(1);
      if (owner) return { ok: false, reason: 'in_use' };

      await cancelPending(userId, at);
      const id = newId('pv');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const resendAvailableAt = new Date(at.getTime() + PHONE_RESEND_AFTER_MS);
      await db.insert(phoneVerifications).values({
        id,
        userId,
        phone,
        status: 'pending',
        codeHash: hashCode(id, code),
        providerRef: sms.name,
        expiresAt: new Date(at.getTime() + PHONE_CODE_LIFETIME_MS),
        resendAvailableAt,
        createdAt: at,
        updatedAt: at,
      });
      try {
        const [person] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
        await sms.send({ to: phone, text: smsFor(localeOrDefault(person?.locale))('phoneCode', { code, minutes: PHONE_CODE_LIFETIME_MS / 60_000 }) });
      } catch (error) {
        // The provider can't text this number (not a mobile, or it replied STOP): ask for another one.
        if (!(error instanceof SmsRejectedError)) throw error;
        await cancelPending(userId, at);
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, maskedPhone: maskUsPhone(phone), resendAvailableAt };
    },

    async verify(userId: string, code: string): Promise<VerifyResult> {
      const at = now();
      const lockedNow = (row: { status: string; lockedUntil: Date | null } | undefined) =>
        row?.status === 'locked' && row.lockedUntil && row.lockedUntil > at ? row.lockedUntil : null;
      const row = await latest(userId);
      const lockedUntilNow = lockedNow(row);
      if (lockedUntilNow) return { ok: false, reason: 'locked', retryAt: lockedUntilNow };
      if (!row || row.status !== 'pending' || !row.codeHash) return { ok: false, reason: 'no_pending' };
      if (row.expiresAt <= at) return { ok: false, reason: 'expired' };
      // A code sent just before a "Not you?" link held the account never sets the number.
      if (await held(userId)) {
        await cancelPending(userId, at);
        return { ok: false, reason: 'no_pending' };
      }

      // Every attempt is counted before its code is compared, with one atomic increment: a burst of guesses can't all be
      // compared against the same count (sweep 2026-11-20). Past the limit, nothing more is compared.
      const [counted] = await db
        .update(phoneVerifications)
        .set({ attempts: sql`${phoneVerifications.attempts} + 1`, updatedAt: at })
        .where(and(eq(phoneVerifications.id, row.id), eq(phoneVerifications.status, 'pending')))
        .returning({ attempts: phoneVerifications.attempts });
      if (!counted) {
        // A guess sent alongside the one that locked the code hears it's locked, as the next one would.
        const lockedMeanwhile = lockedNow(await latest(userId));
        return lockedMeanwhile ? { ok: false, reason: 'locked', retryAt: lockedMeanwhile } : { ok: false, reason: 'no_pending' };
      }
      if (counted.attempts > PHONE_MAX_ATTEMPTS) {
        const lockedUntil = new Date(at.getTime() + PHONE_LOCK_MS);
        await db.update(phoneVerifications).set({ status: 'locked', lockedUntil, updatedAt: at }).where(eq(phoneVerifications.id, row.id));
        return { ok: false, reason: 'locked', retryAt: lockedUntil };
      }
      const expected = Buffer.from(row.codeHash, 'hex');
      const actual = Buffer.from(hashCode(row.id, code.trim()), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const attempts = counted.attempts;
        if (attempts >= PHONE_MAX_ATTEMPTS) {
          const lockedUntil = new Date(at.getTime() + PHONE_LOCK_MS);
          await db
            .update(phoneVerifications)
            .set({ attempts, status: 'locked', lockedUntil, updatedAt: at })
            .where(eq(phoneVerifications.id, row.id));
          return { ok: false, reason: 'locked', retryAt: lockedUntil };
        }
        return { ok: false, reason: 'incorrect' };
      }

      // The number may have been verified by someone else since the code was sent.
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phone, row.phone), ne(users.id, userId)))
        .limit(1);
      if (owner) {
        await db.update(phoneVerifications).set({ status: 'canceled', updatedAt: at }).where(eq(phoneVerifications.id, row.id));
        return { ok: false, reason: 'no_pending' };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(phoneVerifications)
          .set({ status: 'approved', codeHash: null, updatedAt: at })
          .where(eq(phoneVerifications.id, row.id));
        await tx.update(users).set({ phone: row.phone, phoneVerifiedAt: at, updatedAt: at }).where(eq(users.id, userId));
      });
      return { ok: true, phone: row.phone };
    },

    /** "Use a different number". */
    async cancel(userId: string): Promise<void> {
      await cancelPending(userId, now());
    },
  };
}

export type PhoneVerification = ReturnType<typeof createPhoneVerification>;
