import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { createLocaleSyncHook, requestLocaleOf, withRequestLocale } from '@/platform/auth/locale';
import { createDb } from '@/platform/db/connect';

/** An account's language (users.locale) and the device's (the NEXT_LOCALE cookie): src/platform/auth/locale.ts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const NONE = 'usr_tmp_lang_none';
const SPANISH = 'usr_tmp_lang_es';

const request = (cookie: string, acceptLanguage = 'en-US') => ({ headers: new Headers({ cookie, 'accept-language': acceptLanguage }), setCookie: vi.fn() });

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    { ...chris!, id: NONE, email: 'tmp-lang-none@example.test', phone: null, locale: null },
    { ...chris!, id: SPANISH, email: 'tmp-lang-es@example.test', phone: null, locale: 'es' },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, [NONE, SPANISH]));
  await pool.end();
});

describe('the language of a sign-in request', () => {
  it('is the device’s choice, else the browser’s languages, else English', () => {
    expect(requestLocaleOf(request('a=1; NEXT_LOCALE=es'))).toBe('es');
    expect(requestLocaleOf(request('', 'es-MX,es;q=0.9'))).toBe('es');
    expect(requestLocaleOf(request('NEXT_LOCALE=fr', 'en-US'))).toBe('en');
    expect(requestLocaleOf(null)).toBe('en');
  });
});

describe('signing in', () => {
  const sync = createLocaleSyncHook(db);

  it('gives an account without a language the device’s, and leaves the device as it is', async () => {
    const ctx = request('NEXT_LOCALE=es');
    await sync({ userId: NONE }, ctx);
    const [person] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, NONE));
    expect(person?.locale).toBe('es');
    expect(ctx.setCookie).not.toHaveBeenCalled();
  });

  it('switches the device to the account’s language', async () => {
    const ctx = request('NEXT_LOCALE=en');
    await sync({ userId: SPANISH }, ctx);
    expect(ctx.setCookie).toHaveBeenCalledWith('NEXT_LOCALE', 'es', expect.objectContaining({ path: '/', sameSite: 'lax' }));
    const already = request('NEXT_LOCALE=es');
    await sync({ userId: SPANISH }, already);
    expect(already.setCookie).not.toHaveBeenCalled();
  });
});

describe('signing up', () => {
  it('gives the new account the language it signed up in', () => {
    expect(withRequestLocale({ email: 'a@example.test' }, request('NEXT_LOCALE=es')).data).toEqual({ email: 'a@example.test', locale: 'es' });
    expect(withRequestLocale({ email: 'a@example.test' }, request('', 'es-419')).data.locale).toBe('es');
  });
  // Wired into Better Auth's user.create hook (src/platform/auth/config.ts); tests/e2e/spanish.spec.ts signs up in Spanish.
});
