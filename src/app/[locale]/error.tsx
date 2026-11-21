'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/ui/screens/system/error-screen';

/**
 * A page under the root layout that failed on the server (when things break, 2026-11-21): shown inside the root layout,
 * so the page's language is on <html> and the theme and fonts apply, with Try again and the way home. Kept small: Next
 * sends this file with every route under it.
 */
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { locale } = useParams<{ locale?: string }>();
  return (
    <div className="paper flex min-h-dvh flex-col">
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-gutter pb-16 outline-none">
        <ErrorScreen locale={locale} digest={error.digest} onRetry={retry} />
      </main>
    </div>
  );
}
