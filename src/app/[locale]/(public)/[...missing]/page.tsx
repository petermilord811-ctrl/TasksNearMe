import { notFound } from 'next/navigation';

/**
 * Any address no route matches (deeper than the one-segment ones that [market] answers): the site's not-found in its
 * shell, instead of Next's bare page for unmatched routes (sweep 2026-11-18). Static and dynamic routes win over a
 * catch-all, so only addresses that would otherwise be Next's own 404 reach it. It never reads its params.
 */
export default function MissingPage(): never {
  notFound();
}
