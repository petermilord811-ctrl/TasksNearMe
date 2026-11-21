'use client';

import { useParams } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import en from '../../../../messages/en/ui/errorPage.json';
import es from '../../../../messages/es/ui/errorPage.json';
import { Button } from '@/ui/primitives/button';

/**
 * A route dialog's page that failed on the server (src/app/[locale]/@modal/(.)app/error.tsx), said inside the dialog,
 * which still closes as usual (its X, Escape). Its words come with it, as the site's error page has them
 * (src/ui/screens/system/error-screen.tsx): the page's messages may be what failed.
 */
export function RouteDialogError({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  const { locale } = useParams<{ locale?: string }>();
  const copy = locale === 'es' ? es : en;
  return <div className="space-y-4 px-4 pt-3 pb-6 pr-14 sm:px-7 sm:pt-7 sm:pr-16 sm:pb-7">
    <DialogPrimitive.Title asChild><h1 className="font-display text-xl/7 font-semibold tracking-[-0.02em] sm:text-2xl/8">{copy.title}</h1></DialogPrimitive.Title>
    <DialogPrimitive.Description className="text-sm text-muted-foreground">{copy.body}</DialogPrimitive.Description>
    <Button type="button" onClick={onRetry} className="min-h-11">{copy.retry}</Button>
    {digest && <p className="text-xs text-muted-foreground tabular-nums">{copy.reference.replace('{digest}', digest)}</p>}
  </div>;
}
