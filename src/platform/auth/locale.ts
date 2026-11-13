import { eq } from 'drizzle-orm';
import { isAppLocale, type AppLocale } from '@/contracts/locale';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, pickLocale } from '@/shared/locale';

/**
 * An account's language (users.locale) and the device's (the NEXT_LOCALE cookie, src/proxy.ts):
 * - a new account takes the language it signed up in;
 * - signing in, the device switches to the account's language (an older account without one takes the
 *   device's);
 * - the account page changes both (src/modules/accounts/language.ts).
 */

/** What Better Auth hands its hooks: the request's headers, and a way to set a cookie on the answer. */
export interface AuthCallContext {
  headers?: Headers | null;
  request?: Request | null;
  setCookie?: (name: string, value: string, options?: typeof LOCALE_COOKIE_OPTIONS) => unknown;
}

function headersOf(ctx: AuthCallContext | null | undefined): Headers | null {
  return ctx?.headers ?? ctx?.request?.headers ?? null;
}

/** One cookie's value from a request's Cookie header. */
export function cookieFrom(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/** The language of the request behind a sign-in or sign-up: the device's choice, else the browser's languages. */
export function requestLocaleOf(ctx: AuthCallContext | null | undefined): AppLocale {
  const headers = headersOf(ctx);
  return pickLocale({ cookie: cookieFrom(headers?.get('cookie'), LOCALE_COOKIE), acceptLanguage: headers?.get('accept-language') });
}

/** `user.create.before`: a new account takes the language of the request that made it. */
export function withRequestLocale<T extends object>(user: T, ctx: AuthCallContext | null): { data: T & { locale: AppLocale } } {
  return { data: { ...user, locale: requestLocaleOf(ctx) } };
}

/** `session.create.after`: the device follows the account's language; an account without one takes the device's. */
export function createLocaleSyncHook(db: Db) {
  return async (session: { userId: string }, ctx: AuthCallContext | null): Promise<void> => {
    const [person] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (!person) return;
    if (!isAppLocale(person.locale)) {
      await db.update(users).set({ locale: requestLocaleOf(ctx) }).where(eq(users.id, session.userId));
      return;
    }
    if (ctx?.setCookie && cookieFrom(headersOf(ctx)?.get('cookie'), LOCALE_COOKIE) !== person.locale) {
      ctx.setCookie(LOCALE_COOKIE, person.locale, LOCALE_COOKIE_OPTIONS);
    }
  };
}
