'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert } from 'lucide-react';
import type { ActionHandler, ActionResult, SocialProvider, SocialSignInError, SocialSignInInput } from '@/contracts';
import { routes } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { cn } from '@/ui/lib/utils';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Spinner } from '@/ui/primitives/spinner';
import { ProviderLogo } from '@/ui/components/brand/provider-logo';

/**
 * "Continue with Google" and "Continue with Microsoft". The app returns the provider's page; the browser
 * goes there with a full page load (it's another site) and comes back to `/sign-in`. If the person comes
 * back with the Back button, the page is restored, so the buttons reset.
 */
export function SocialSignIn({
  providers,
  error,
  onContinueWith,
  className,
}: {
  providers: SocialProvider[];
  error?: { provider: SocialProvider; reason: SocialSignInError };
  onContinueWith: ActionHandler<SocialSignInInput>;
  className?: string;
}) {
  const t = useTranslations('signIn.social');
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [result, setResult] = useState<ActionResult>();

  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  async function start(provider: SocialProvider) {
    if (pending) return;
    setPending(provider);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await onContinueWith({ provider });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    if (next.ok && next.redirectTo) {
      // Stays busy while the browser leaves for the provider.
      window.location.assign(next.redirectTo);
      return;
    }
    setPending(null);
    setResult(next);
  }

  if (providers.length === 0) return null;
  return (
    <div className={cn('space-y-3', className)}>
      {error && (
        <Alert role="alert" className="border-destructive/30">
          <CircleAlert aria-hidden="true" className="text-destructive" />
          <AlertDescription className="text-foreground">
            <p>{t(`errors.${error.reason}`, { provider: t(`names.${error.provider}`) })}</p>
            {error.reason === 'not_allowed' && (
              <Link href={routes.help()} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('getHelp')}</Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2.5">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => start(provider)}
            disabled={pending !== null}
            aria-busy={pending === provider}
            className="group/social relative inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-foreground/[0.12] bg-card px-5 text-[15px] font-semibold text-foreground shadow-xs transition-[background-color,border-color,box-shadow,transform] duration-200 outline-none hover:border-foreground/25 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/[0.06]"
          >
            <span className="absolute left-4 grid size-6 place-items-center">
              {pending === provider ? <Spinner aria-hidden="true" className="size-4" /> : <ProviderLogo provider={provider} className="transition-transform duration-300 group-hover/social:scale-110" />}
            </span>
            {t(`continue.${provider}`)}
          </button>
        ))}
      </div>
      {providers.includes('microsoft') && <p className="text-xs text-muted-foreground">{t('microsoftHint')}</p>}
      <FormFeedback result={result} />
    </div>
  );
}

/** "or" between the providers and the email field. */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
