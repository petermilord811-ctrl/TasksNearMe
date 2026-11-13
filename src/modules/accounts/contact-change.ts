import 'server-only';
import { isAPIError } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';
import type { ActionResult, EmailChangeConfirmInput, EmailInput, OneTimeCodeInput, PhoneInput } from '@/contracts';
import { emailChangeConfirmInputSchema, emailInputSchema, localeOrDefault, oneTimeCodeInputSchema, phoneInputSchema } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { fieldError, rateLimited, validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Auth } from '@/platform/auth/config';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimits } from '@/platform/rate-limit';
import { normalizeUsPhone } from '@/shared/phone';
import { renderEmailChangedNotice, renderPhoneChangedNotice } from './emails/contact-change';
import type { PhoneVerification } from './phone-verification';
import { users } from './schema';

/**
 * Changing the account's email or phone from the account page, each confirmed with a 6-digit code
 * (AccountHandlers in src/contracts/account.ts).
 *
 * - Email: Better Auth's email-change endpoints. The code goes to the new address and works for 10 minutes,
 *   3 tries. Entering it switches the account (the session stays signed in) and the old address gets a notice.
 * - Phone: the same text-message code as sign-in (phone-verification.ts). A changed number is announced by
 *   email.
 *
 * An address or number another account already uses is refused up front (`in_use`), as phone numbers
 * already are at sign-in: a typo then shows at once instead of a code that never arrives. Sending is
 * rate-limited per person and per address.
 */

const EMAIL_CHANGE_RULES = {
  perUser: { limit: 3, windowSeconds: 10 * 60 },
  perEmail: { limit: 5, windowSeconds: 24 * 60 * 60 },
};

export interface ContactChangeDeps {
  db: Db;
  auth: Pick<Auth, 'api'>;
  email: EmailProvider;
  phoneVerification: PhoneVerification;
  appUrl: string;
  now?: () => Date;
}

const expiredCode: ActionResult = { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } };

export function createContactChange({ db, auth, email, phoneVerification, appUrl, now = () => new Date() }: ContactChangeDeps) {
  async function loadUser(userId: string) {
    const [user] = await db
      .select({ email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  }

  async function emailInUse(address: string, userId: string): Promise<boolean> {
    const [owner] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, address), ne(users.id, userId))).limit(1);
    return owner !== undefined;
  }

  /** A notice must never undo or fail the change it reports. */
  async function notify(to: string, rendered: { subject: string; text: string; html: string }, tag: string) {
    try {
      await email.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html, tag });
    } catch (error) {
      console.error(`[${tag}]`, error);
    }
  }

  return {
    /** onStartEmailChange: a code to the new address. Asking again for the same address sends a new code. */
    async startEmailChange(userId: string, requestHeaders: Headers, input: EmailInput): Promise<ActionResult> {
      const parsed = emailInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const newEmail = parsed.data.email;
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };
      if (newEmail === user.email.toLowerCase()) return fieldError('email', 'unchanged');
      if (await emailInUse(newEmail, userId)) return fieldError('email', 'in_use');

      const limited = await consumeRateLimits(
        db,
        [
          { key: `email-change:user:${userId}`, rule: EMAIL_CHANGE_RULES.perUser },
          { key: `email-change:email:${newEmail}`, rule: EMAIL_CHANGE_RULES.perEmail },
        ],
        now(),
      );
      if (!limited.ok) return rateLimited(limited.retryAt);

      await auth.api.requestEmailChangeEmailOTP({ body: { newEmail }, headers: requestHeaders });
      return { ok: true, code: 'sent' };
    },

    /** onConfirmEmailChange: the code from the new address switches the account to it. */
    async confirmEmailChange(userId: string, requestHeaders: Headers, input: EmailChangeConfirmInput): Promise<ActionResult> {
      const parsed = emailChangeConfirmInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const { email: newEmail, code } = parsed.data;
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };
      const previousEmail = user.email.toLowerCase();
      // Sent twice (a double tap): the first one already switched it.
      if (newEmail === previousEmail) return { ok: true, code: 'updated' };

      try {
        await auth.api.changeEmailEmailOTP({ body: { newEmail, otp: code }, headers: requestHeaders });
      } catch (error) {
        if (!isAPIError(error)) throw error;
        const body = error.body as { code?: string; message?: string } | undefined;
        if (body?.code === 'INVALID_OTP') return fieldError('code', 'incorrect');
        // Expired, or used up after three wrong tries: a new code is needed.
        if (body?.code === 'OTP_EXPIRED' || body?.code === 'TOO_MANY_ATTEMPTS') return expiredCode;
        // Someone else took the address after the code was sent.
        if (body?.message === 'Email already in use') return fieldError('email', 'in_use');
        throw error;
      }

      await db.insert(auditLog).values({
        id: newId('aud'),
        actorId: userId,
        actorRole: 'user',
        action: 'account.email_changed',
        targetType: 'user',
        targetId: userId,
        metadata: { previousEmail, newEmail },
      });
      await notify(previousEmail, renderEmailChangedNotice({ newEmail, appUrl, locale: localeOrDefault(user.locale) }), 'email-changed');
      return { ok: true, code: 'updated' };
    },

    /** onStartPhoneChange: adding a number, or replacing the verified one. */
    async startPhoneChange(userId: string, input: PhoneInput): Promise<ActionResult> {
      const parsed = phoneInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };
      const phone = normalizeUsPhone(parsed.data.phone);
      if (phone && phone === user.phone && user.phoneVerifiedAt) return fieldError('phone', 'unchanged');

      const result = await phoneVerification.start(userId, parsed.data.phone);
      if (result.ok) return { ok: true, code: 'sent' };
      if (result.reason === 'rate_limited') return rateLimited(result.retryAt);
      return fieldError('phone', result.reason);
    },

    /** onConfirmPhoneChange: the texted code verifies the new number and replaces the old one. */
    async confirmPhoneChange(userId: string, input: OneTimeCodeInput): Promise<ActionResult> {
      const parsed = oneTimeCodeInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };

      const result = await phoneVerification.verify(userId, parsed.data.code);
      if (!result.ok) {
        switch (result.reason) {
          case 'incorrect':
            return fieldError('code', 'incorrect');
          case 'locked':
            return rateLimited(result.retryAt);
          case 'expired':
          case 'no_pending':
            return expiredCode;
        }
      }

      const last4 = result.phone.slice(-4);
      await db.insert(auditLog).values({
        id: newId('aud'),
        actorId: userId,
        actorRole: 'user',
        action: user.phone ? 'account.phone_changed' : 'account.phone_added',
        targetType: 'user',
        targetId: userId,
        metadata: { last4, ...(user.phone ? { previousLast4: user.phone.slice(-4) } : {}) },
      });
      if (user.phone && user.phone !== result.phone) await notify(user.email, renderPhoneChangedNotice({ last4, appUrl, locale: localeOrDefault(user.locale) }), 'phone-changed');
      return { ok: true, code: 'updated' };
    },
  };
}

export type ContactChange = ReturnType<typeof createContactChange>;
