import { cookies, headers } from 'next/headers';
import * as rootParams from 'next/root-params';
import { getRequestConfig } from 'next-intl/server';
import { MARKET_TIME_ZONE } from '@/contracts/common';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/contracts/locale';
import { LOCALE_COOKIE, pickLocale } from '@/shared/locale';
import { messagesFor } from './catalog';

/**
 * The language of a request. Pages and layouts read the [locale] root segment (src/app/[locale]), which
 * src/proxy.ts fills in from the URL, the device's choice or the browser's languages, so every page
 * prerenders once per language. An explicit `getTranslations({ locale })` wins over the segment.
 * Copy: UI namespaces in messages/<locale>/ui/*, server-side copy under "server" in messages/<locale>/app/*.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isAppLocale(explicit) ? explicit : await requestLocale();
  return { locale, timeZone: MARKET_TIME_ZONE, messages: messagesFor(locale) };
});

async function requestLocale(): Promise<AppLocale> {
  let segment: string | undefined;
  try {
    segment = await rootParams.locale();
  } catch (error) {
    // Root params are not available in Server Actions and Route Handlers (Next 16): use what the
    // proxy would choose for this device. Anything else is a real error.
    if (!(error instanceof Error) || !/Server Action|Route Handler/.test(error.message)) throw error;
    const [store, list] = await Promise.all([cookies(), headers()]);
    return pickLocale({ cookie: store.get(LOCALE_COOKIE)?.value, acceptLanguage: list.get('accept-language') });
  }
  // The root layout answers 404 for anything else; until then, render in English.
  return isAppLocale(segment) ? segment : DEFAULT_LOCALE;
}
