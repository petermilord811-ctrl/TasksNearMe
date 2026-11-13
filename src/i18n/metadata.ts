import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { localeOrDefault } from '@/contracts/locale';
import { localizedPath } from '@/shared/locale';

/**
 * A public page's address in each language, for search engines: `/x` in English (also the default for
 * anyone else), `/es/x` in Spanish. The canonical address is the one in the page's own language.
 */
export async function languageAlternates(path: string): Promise<NonNullable<Metadata['alternates']>> {
  const locale = localeOrDefault(await getLocale());
  return {
    canonical: localizedPath(path, locale),
    languages: { 'en-US': path, 'es-US': localizedPath(path, 'es'), 'x-default': path },
  };
}
