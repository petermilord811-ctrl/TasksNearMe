import type { MetadataRoute } from 'next';
import { APP_LOCALES } from '@/contracts/locale';
import { localizedPath } from '@/shared/locale';
import { absoluteUrl } from './sitemap-entries';

/**
 * robots.txt (src/app/robots.ts). With indexing off (src/shared/search-indexing.ts) every crawler is asked to stay
 * out. With it on, crawlers may read every public page, and skip what is never useful in search:
 * - the API: JSON, webhooks, and uploaded photos (people's avatars and work samples stay out of image search);
 * - the staff workspace and the development tools (not found to anyone else) and one-time sign-in codes;
 * - unsubscribe links and invite links (personal; an invite link also sets a cookie and counts against a limit).
 * Each section in every language. `$` ends a path and `?` starts a query, so "/admin" doesn't also shut out a
 * market whose slug merely begins with those letters.
 *
 * Signed-in pages (/app) stay crawlable on purpose: public pages link to them ("Post a task"), they redirect to
 * sign-in, and sign-in is noindex. Blocking them would only get them listed as "indexed, though blocked".
 * The same goes for sign-in, the waitlist and closed tasks: a noindex is seen only on a page that is crawled.
 */

/** Sections that are also a page of their own (/code) or could be mistaken for the start of a market slug. */
const CLOSED_SECTIONS = ['/admin', '/dev', '/code'];
/** Sections whose addresses always go deeper: one-time links from emails (/account/not-me, plan 5.23) and invites. */
const CLOSED_FOLDERS = ['/email/', '/invite/', '/account/'];

export function disallowedPaths(): string[] {
  const inEveryLanguage = (path: string) => APP_LOCALES.map((locale) => localizedPath(path, locale));
  return [
    '/api/',
    ...CLOSED_SECTIONS.flatMap(inEveryLanguage).flatMap((path) => [`${path}$`, `${path}/`, `${path}?`]),
    ...CLOSED_FOLDERS.flatMap(inEveryLanguage),
  ];
}

export function robotsFile(options: { indexing: boolean; baseUrl: string }): MetadataRoute.Robots {
  if (!options.indexing) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: disallowedPaths() },
    sitemap: absoluteUrl(options.baseUrl, '/sitemap.xml'),
  };
}
