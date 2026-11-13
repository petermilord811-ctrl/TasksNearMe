/**
 * The languages the app is offered in (blueprint 01: English at launch, Spanish in phase 2).
 * English is the default and the fallback: a message missing in Spanish shows in English.
 */
export const APP_LOCALES = ['en', 'es'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value);
}

/** Each language's name in itself, for the language switch. Never translated. */
export const LOCALE_NAMES: Record<AppLocale, string> = { en: 'English', es: 'Español' };

/** BCP 47 tags for `Intl` formatting: US conventions in both languages ($1,234.50, 12-hour clock). */
export const INTL_LOCALES: Record<AppLocale, string> = { en: 'en-US', es: 'es-US' };
