'use client';

import { useParams } from 'next/navigation';
import en from '../../messages/en/ui/errorPage.json';
import es from '../../messages/es/ui/errorPage.json';

/**
 * The root layout itself failed (when things break, 2026-11-21): this replaces it, so it brings its own document and
 * plain styles (the app's stylesheet isn't there), light or dark as the device is. Same words as the page-level error
 * (src/ui/screens/system/error-screen.tsx), in the page's language.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useParams<{ locale?: string }>()?.locale === 'es' ? 'es' : 'en';
  const copy = locale === 'es' ? es : en;
  return (
    <html lang={locale}>
      <body>
        <style>{`
          body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; box-sizing: border-box; font-family: system-ui, sans-serif; background: #faf7f2; color: #1f1a16; }
          main { max-width: 32rem; text-align: center; }
          h1 { font-size: 1.5rem; margin: 0.5rem 0 0.75rem; }
          p { color: #5f5750; line-height: 1.5; }
          button, a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 8px; font: inherit; font-weight: 600; }
          button { border: 0; background: #c13f12; color: #fff; cursor: pointer; }
          a { color: #c13f12; text-decoration: none; }
          @media (prefers-color-scheme: dark) { body { background: #171310; color: #f3ede6; } p { color: #b9afa5; } a { color: #f08a5d; } }
        `}</style>
        <main>
          <p>TasksNearMe</p>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <button type="button" onClick={() => retry()}>{copy.retry}</button> <a href={locale === 'es' ? '/es' : '/'}>{copy.home}</a>
          {error.digest && <p><small>{copy.reference.replace('{digest}', error.digest)}</small></p>}
        </main>
      </body>
    </html>
  );
}
