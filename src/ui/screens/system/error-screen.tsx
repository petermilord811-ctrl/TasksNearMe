'use client';

import en from '../../../../messages/en/ui/errorPage.json';
import es from '../../../../messages/es/ui/errorPage.json';
import { Button } from '@/ui/primitives/button';

/**
 * What a page shows when it failed on the server: the database or a provider away, or a bug (when things break,
 * 2026-11-21; it was Next's bare default page, in English). Its words come with it, in both languages, not through the
 * page's messages, which may be what failed. Try again fetches and renders the page again (Next's `retry`). The
 * reference is the error's digest, which support matches to the server's log; it says nothing about the person.
 */
export function ErrorScreen({ locale, digest, onRetry }: { locale?: string; digest?: string; onRetry: () => void }) {
  const copy = locale === 'es' ? es : en;
  return (
    <section aria-labelledby="error-page-title" className="mx-auto max-w-reading space-y-4 py-12 text-center">
      <p className="font-display text-sm font-semibold tracking-wide text-primary">TasksNearMe</p>
      <h1 id="error-page-title" className="font-display text-2xl font-semibold tracking-[-0.02em]">{copy.title}</h1>
      <p className="text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={onRetry} className="min-h-11">{copy.retry}</Button>
        {/* A full load, not the app's router: the router may be part of what failed. */}
        <a href={locale === 'es' ? '/es' : '/'} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{copy.home}</a>
      </div>
      {digest && <p className="text-xs text-muted-foreground tabular-nums">{copy.reference.replace('{digest}', digest)}</p>}
    </section>
  );
}
