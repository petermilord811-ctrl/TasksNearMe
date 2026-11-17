'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BellOff, CircleAlert, CircleCheck, MailCheck } from 'lucide-react';
import { routes, type ActionResult, type WaitlistUnsubscribeHandlers, type WaitlistUnsubscribePageData } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * `/email/waitlist`: from the unsubscribe link in a waitlist email (completion plan 8.3), without signing in. It asks
 * before turning the waitlist's emails off, and offers to turn them back on afterwards. It never shows the address.
 */
export function WaitlistUnsubscribeScreen({ data, handlers }: { data: WaitlistUnsubscribePageData; handlers: WaitlistUnsubscribeHandlers }) {
  const t = useTranslations('waitlist.unsubscribe');
  const [state, setState] = useState(data.state);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const [resubscribed, setResubscribed] = useState(false);

  async function run(handler: () => Promise<ActionResult>, next: 'confirm' | 'unsubscribed') {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    let outcome: ActionResult;
    try {
      outcome = await handler();
    } catch {
      outcome = { ok: false, code: 'unknown' };
    }
    setPending(false);
    if (!outcome.ok) {
      setResult(outcome);
      return;
    }
    setResubscribed(next === 'confirm');
    setState(next);
  }

  const Icon = state === 'confirm' ? BellOff : state === 'unsubscribed' ? MailCheck : CircleAlert;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-gutter py-12 text-center sm:py-16">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground"><Icon className="size-6" /></span>
      <p className="mt-6 text-sm font-medium text-muted-foreground">{t('title')}</p>
      <h1 className="mt-2 font-heading text-2xl/8 font-bold text-balance sm:text-[28px]/9">
        {state === 'confirm' ? t('confirmTitle') : state === 'unsubscribed' ? t('doneTitle') : t('invalidTitle')}
      </h1>
      <p className="mt-3 text-muted-foreground">{state === 'confirm' ? t('confirmText') : state === 'unsubscribed' ? t('doneText') : t('invalidText')}</p>
      <div aria-live="polite" className="mt-4 w-full">
        {resubscribed && state === 'confirm' && (
          <p className="flex items-center justify-center gap-2 text-sm text-foreground"><CircleCheck aria-hidden="true" className="size-4 text-success" />{t('resubscribed')}</p>
        )}
        <FormFeedback result={result} />
      </div>
      <div className="mt-4 flex w-full flex-col items-center gap-2">
        {state === 'confirm' && (
          <Button type="button" disabled={pending} aria-busy={pending} className="w-full sm:w-auto" onClick={() => void run(handlers.onUnsubscribe, 'unsubscribed')}>
            {pending && <Spinner aria-hidden="true" />}{pending ? t('working') : t('confirm')}
          </Button>
        )}
        {state === 'unsubscribed' && (
          <Button type="button" variant="outline" disabled={pending} aria-busy={pending} className="w-full sm:w-auto" onClick={() => void run(handlers.onResubscribe, 'confirm')}>
            {pending && <Spinner aria-hidden="true" />}{pending ? t('working') : t('resubscribe')}
          </Button>
        )}
        {state === 'invalid'
          ? <Link href={routes.home()} className={buttonVariants({ variant: 'outline' })}>{t('home')}</Link>
          : <Link href={routes.home()} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t('home')}</Link>}
      </div>
    </div>
  );
}
