import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import type { ComponentProps } from 'react';
import { DEFAULT_LOCALE, isAppLocale } from '@/contracts/locale';
import { localizedPath, splitLocalePath } from '@/shared/locale';

/**
 * An internal link that keeps the page's language in the address: on a Spanish page, `/pricing` becomes
 * `/es/pricing`, so search engines follow Spanish pages to Spanish pages (SEO plan S7.2) and a shared link opens in
 * the language it was copied in. English addresses stay plain (English is the default, src/proxy.ts). External
 * links, protocol-relative ones, `#anchors`, API routes and addresses that already name a language are left as
 * they are.
 */
export function localeHref(href: string, locale: string): string {
  if (!isAppLocale(locale) || locale === DEFAULT_LOCALE) return href;
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return href;
  const path = href.split(/[?#]/)[0] || '/';
  if (splitLocalePath(path)) return href;
  return localizedPath(path, locale) + href.slice(path.length);
}

/** `next/link` for internal string addresses, with the page's language kept (see `localeHref`). Server or client. */
export function LocaleLink({ href, ...props }: Omit<ComponentProps<typeof NextLink>, 'href'> & { href: string }) {
  const locale = useLocale();
  return <NextLink href={localeHref(href, locale)} {...props} />;
}
