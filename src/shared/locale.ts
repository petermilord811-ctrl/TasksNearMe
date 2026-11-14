import { APP_LOCALES, DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/contracts/locale';

/**
 * Choosing a language for a request (src/proxy.ts, and Server Actions through src/i18n/request.ts).
 * Order: an explicit /es/... or /en/... URL, then the device's choice (the cookie), then the browser's
 * languages (Accept-Language), then English.
 */

/** The cookie that carries a device's language. Set by the language switch, at sign-in, and by /es/... URLs. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true } as const;

/** "/es/pricing" → { locale: 'es', path: '/pricing' }; "/es" → { locale: 'es', path: '/' }; "/pricing" → null. */
export function splitLocalePath(pathname: string): { locale: AppLocale; path: string } | null {
  const [, first, rest] = /^\/([^/]+)(\/.*)?$/.exec(pathname) ?? [];
  if (!isAppLocale(first)) return null;
  return { locale: first, path: rest ?? '/' };
}

/** "/pricing" in Spanish → "/es/pricing"; English is the default, so its paths carry no prefix. */
export function localizedPath(path: string, locale: AppLocale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/** Each language's hreflang code for search engines: US English and US Spanish (as INTL_LOCALES formats them). */
const HREFLANG = { en: 'en-US', es: 'es-US' } as const satisfies Record<AppLocale, string>;
export type Hreflang = (typeof HREFLANG)[AppLocale] | 'x-default';

/**
 * A public page's path in every language, by hreflang: "/x" in English, which is also the default (x-default) for
 * everyone else, and "/es/x" in Spanish. One source for the pages' language links (src/i18n/metadata.ts) and the
 * sitemap's (src/modules/seo), which search engines expect to agree.
 */
export function languageAlternatePaths(path: string): Record<Hreflang, string> {
  const byLanguage = Object.fromEntries(APP_LOCALES.map((locale) => [HREFLANG[locale], localizedPath(path, locale)]));
  return { ...byLanguage, 'x-default': localizedPath(path, DEFAULT_LOCALE) } as Record<Hreflang, string>;
}

/**
 * The best of our languages for an Accept-Language header, by quality, matching on the primary subtag
 * ("es-MX" → es). A wildcard or nothing we offer → English.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      // A quality that doesn't parse drops the entry (q becomes NaN).
      const q = params.map((p) => /^\s*q\s*=\s*(.*?)\s*$/.exec(p)?.[1]).find((value) => value !== undefined);
      return { primary: tag.trim().toLowerCase().split('-')[0] ?? '', q: q === undefined ? 1 : /^[0-9.]+$/.test(q) ? Number(q) : NaN, index };
    })
    .filter((entry) => entry.primary && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { primary } of ranked) {
    if (primary === '*') return DEFAULT_LOCALE;
    if (isAppLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/** The device's saved choice if it is one of ours, else the browser's languages. */
export function pickLocale(input: { cookie?: string | null; acceptLanguage?: string | null }): AppLocale {
  return isAppLocale(input.cookie) ? input.cookie : negotiateLocale(input.acceptLanguage);
}

export { APP_LOCALES, DEFAULT_LOCALE };
