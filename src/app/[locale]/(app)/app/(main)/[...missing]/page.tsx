import { notFound } from 'next/navigation';

/**
 * An address under /app that no page matches: the app's not-found, in the signed-in shell, rather than the public
 * site's (sweep 2026-11-18). Every real /app page is more specific than a catch-all, so only those addresses reach it.
 */
export default function MissingAppPage(): never {
  notFound();
}
