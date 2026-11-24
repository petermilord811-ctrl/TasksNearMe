import type { PeekTarget } from '@/contracts/peek';
import { LEGAL_DOCS, routes, type LegalDoc } from '@/contracts/routes';
import { splitLocalePath } from './locale';

/** A helper handle or a help article's slug, as their routes build them (lowercase letters, digits and dashes). */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** Help center pages that are a page to use, not a document to read (the contact form). */
const HELP_PAGES = new Set(['contact']);

/**
 * What a link opens in a peek sheet (2026-11-23, owner: "I hate redirect … some buttons need new window instead of
 * direct. or some buttons need sidebar"): a helper's public profile (`/helpers/<handle>`), the help center (`/help`), one
 * of its articles (`/help/<slug>`) or a legal document (`/legal/<doc>`), in any language. Null for anything else: other
 * pages, other sites, a helper's request page, the help contact form.
 */
export function peekTargetOfHref(href: string, origin: string): PeekTarget | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const path = pagePath(url.pathname);
  if (path === '/help') return { kind: 'help' };
  const match = /^\/(helpers|help|legal)\/([^/]+)$/.exec(path);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]!);
  } catch {
    return null;
  }
  if (!SLUG.test(slug)) return null;
  if (match[1] === 'helpers') return { kind: 'helper', handle: slug };
  if (match[1] === 'legal') return (LEGAL_DOCS as readonly string[]).includes(slug) ? { kind: 'legal', doc: slug as LegalDoc } : null;
  return HELP_PAGES.has(slug) ? null : { kind: 'help', slug };
}

/** A page's path without its language prefix and trailing slash (`/es/help/` → `/help`). */
function pagePath(pathname: string): string {
  return (splitLocalePath(pathname)?.path ?? pathname).replace(/\/+$/, '') || '/';
}

/**
 * Whether a link leads to the page it's on (`current`, an absolute URL), in any language and whatever its `#section`:
 * a peek of the page under it would show the same thing again, and its anchors still scroll.
 */
export function isSamePage(href: string, current: string): boolean {
  try {
    const here = new URL(current);
    const there = new URL(href, here);
    return there.origin === here.origin && pagePath(there.pathname) === pagePath(here.pathname);
  } catch {
    return false;
  }
}

/** The page a peek shows ("Open in new tab"). */
export function peekHref(target: PeekTarget): string {
  if (target.kind === 'helper') return routes.helperProfile(target.handle);
  if (target.kind === 'legal') return routes.legal(target.doc);
  return routes.help(target.slug);
}

/** The same target as a key (a sheet tells its views apart by it). */
export function peekKey(target: PeekTarget): string {
  return target.kind === 'helper' ? `helper:${target.handle}` : target.kind === 'legal' ? `legal:${target.doc}` : `help:${target.slug ?? ''}`;
}
