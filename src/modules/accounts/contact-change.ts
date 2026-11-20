import 'server-only';
import { isAPIError } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';
import type { ActionResult, EmailChangeConfirmInput, EmailInput, OneTimeCodeInput, PhoneInput } from '@/contracts';
import { emailChangeConfirmInputSchema, emailInputSchema, localeOrDefault, oneTimeCodeInputSchema, phoneInputSchema } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import type { SmsSender } from '@/integrations/sms';
import { fieldError, rateLimited, validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Auth } from '@/platform/auth/config';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimits } from '@/platform/rate-limit';
import { normalizeUsPhone } from '@/shared/phone';
import { recordContactChange } from './contact-revert';
import { contactRevertUrl } from './contact-revert-token';
import { renderEmailChangedNotice, renderPhoneChangedNotice, renderPhoneChangedText } from './emails/contact-change';
import type { PhoneVerification } from './phone-verification';
import { users } from './schema';

/**
 * Changing the account's email or phone from the account page, each confirmed with a 6-digit code
 * (AccountHandlers in src/contracts/account.ts).
 *
 * - Email: Better Auth's email-change endpoints. The code goes to the new address and works for 10 minutes,
 *   3 tries. Entering it switches the account (the session stays signed in) and the old address gets a notice.
 * - Phone: the same text-message code as sign-in (phone-verification.ts). A changed number is announced by
 *   email, and by text to the old number.
 * Each notice carries the change's "Not you?" link (completion plan 5.23, ./contact-revert.ts), and while a used
 * link holds the account, neither can change (`held`).
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
  /** The old number's notice. */
  sms: SmsSender;
  phoneVerification: PhoneVerification;
  appUrl: string;
  now?: () => Date;
}

const expiredCode: ActionResult = { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } };

export function createContactChange({ db, auth, email, sms, phoneVerification, appUrl, now = () => new Date() }: ContactChangeDeps) {
  async function loadUser(userId: string) {
    const [user] = await db
      .select({ email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, locale: users.locale, held: users.contactHoldAt })
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

  async function text(to: string, body: string, tag: string) {
    try {
      await sms.send({ to, text: body });
    } catch (error) {
      // A number that can't take texts any more (STOP, landline) or a provider failure: the email still went.
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
      if (user.held) return fieldError('email', 'held');
      if (newEmail === user.email.toLowerCase()) return fieldError('email', 'unchanged');

      // Counted first: whether another account uses an address can't be asked faster than the limit (security review SEC20).
      const limited = await consumeRateLimits(
        db,
        [
          { key: `email-change:user:${userId}`, rule: EMAIL_CHANGE_RULES.perUser },
          { key: `email-change:email:${newEmail}`, rule: EMAIL_CHANGE_RULES.perEmail },
        ],
        now(),
      );
      if (!limited.ok) return rateLimited(limited.retryAt);
      if (await emailInUse(newEmail, userId)) return fieldError('email', 'in_use');

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
      if (user.held) return fieldError('email', 'held');

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
      const link = await recordContactChange(db, { userId, kind: 'email', previous: previousEmail, next: newEmail }, now());
      await notify(previousEmail, renderEmailChangedNotice({ newEmail, revertUrl: contactRevertUrl(appUrl, link), appUrl, locale: localeOrDefault(user.locale) }), 'email-changed');
      return { ok: true, code: 'updated' };
    },

    /** onStartPhoneChange: adding a number, or replacing the verified one. */
    async startPhoneChange(userId: string, input: PhoneInput): Promise<ActionResult> {
      const parsed = phoneInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };
      if (user.held) return fieldError('phone', 'held');
      const phone = normalizeUsPhone(parsed.data.phone);
      if (phone && phone === user.phone && user.phoneVerifiedAt) return fieldError('phone', 'unchanged');

      // The account page replaces a verified number; its notice and "Not you?" link follow the code.
      const result = await phoneVerification.start(userId, parsed.data.phone, { change: true });
      if (result.ok) return { ok: true, code: 'sent' };
      if (result.reason === 'rate_limited') return rateLimited(result.retryAt);
      // Not here: the account page's change may replace a verified number.
      if (result.reason === 'verified') return { ok: false, code: 'not_allowed' };
      return fieldError('phone', result.reason);
    },

    /** onConfirmPhoneChange: the texted code verifies the new number and replaces the old one. */
    async confirmPhoneChange(userId: string, input: OneTimeCodeInput): Promise<ActionResult> {
      const parsed = oneTimeCodeInputSchema.safeParse(input);
      if (!parsed.success) return validationFailed(parsed.error);
      const user = await loadUser(userId);
      if (!user) return { ok: false, code: 'not_allowed' };
      // The code step has only the code field: the reason shows there.
      if (user.held) return fieldError('code', 'held');

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
      if (user.phone && user.phone !== result.phone) {
        const locale = localeOrDefault(user.locale);
        const link = await recordContactChange(db, { userId, kind: 'phone', previous: user.phone, next: result.phone }, now());
        const revertUrl = contactRevertUrl(appUrl, link);
        await notify(user.email, renderPhoneChangedNotice({ last4, revertUrl, appUrl, locale }), 'phone-changed');
        // The old number hears about it too, when it was verified (it was the account's until now).
        if (user.phoneVerifiedAt) await text(user.phone, renderPhoneChangedText({ revertUrl, locale }), 'phone-changed-text');
      }
      return { ok: true, code: 'updated' };
    },
  };
}

export type ContactChange = ReturnType<typeof createContactChange>;
