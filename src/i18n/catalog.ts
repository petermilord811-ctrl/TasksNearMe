import type { AppLocale } from '@/contracts/locale';
import enApp from '../../messages/en/app';
import enUi from '../../messages/en/ui';
import esApp from '../../messages/es/app';
import esUi from '../../messages/es/ui';

/**
 * The message catalogs. UI copy lives in messages/<locale>/ui/*; server-side copy in
 * messages/<locale>/app/* under the top-level "server" namespace, so the two never collide.
 * English is complete by definition; every other language is laid over it, so a message not yet
 * translated shows in English rather than as a missing key. Keys that exist only in a translation
 * are dropped (src/i18n/catalog.test.ts reports them).
 */

const english = { ...enUi, ...enApp };
export type Messages = typeof english;

type Tree = { [key: string]: string | Tree };

/** `base` with every string that `over` also has (at the same path, as a string) replaced by `over`'s. */
export function layOver<T extends object>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object') return base;
  const result: Tree = {};
  for (const [key, value] of Object.entries(base as Tree)) {
    const other = (over as Tree)[key];
    if (typeof value === 'string') result[key] = typeof other === 'string' && other.trim() ? other : value;
    else result[key] = layOver(value, other);
  }
  return result as T;
}

const catalogs: Record<AppLocale, Messages> = {
  en: english,
  es: layOver(english, { ...esUi, ...esApp }),
};

export function messagesFor(locale: AppLocale): Messages {
  return catalogs[locale];
}

/**
 * Something built once per language and kept (a translator for emails: `perLocale((locale) =>
 * createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }))`).
 */
export function perLocale<T>(make: (locale: AppLocale) => T): (locale: AppLocale) => T {
  const made = new Map<AppLocale, T>();
  return (locale) => {
    if (!made.has(locale)) made.set(locale, make(locale));
    return made.get(locale)!;
  };
}

/**
 * Only the given namespaces of a catalog, for a client provider (src/i18n/client-messages.tsx). A dotted
 * namespace ("helperCard.categories") keeps just that part; "*" keeps everything. A namespace the catalog doesn't
 * have is left out (src/i18n/client-messages.test.ts reports it).
 */
export function pickMessages(messages: object, namespaces: readonly string[]): Tree {
  if (namespaces.includes('*')) return messages as Tree;
  const picked: Tree = {};
  for (const namespace of namespaces) {
    const path = namespace.split('.');
    let from: string | Tree | undefined = messages as Tree;
    for (const key of path) from = typeof from === 'object' ? from[key] : undefined;
    if (from === undefined) continue;
    let into = picked;
    path.slice(0, -1).forEach((key) => {
      const next = into[key];
      into = typeof next === 'object' ? next : (into[key] = {});
    });
    into[path.at(-1)!] = from;
  }
  return picked;
}
