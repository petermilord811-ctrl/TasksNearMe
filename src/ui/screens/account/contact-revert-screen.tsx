'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CONTACT_REVERT_DAYS, routes, type ActionResult, type ContactRevertHandlers, type ContactRevertPageData } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { cn } from '@/ui/lib/utils';

type Step = ContactRevertPageData['state'] | 'done';

export interface ContactRevertScreenProps {
  data: ContactRevertPageData;
  handlers: ContactRevertHandlers;
}

/**
 * `/account/not-me`: the "Not you?" link in an email or phone change notice (completion plan 5.23), opened without
 * signing in. It asks before doing anything (mail apps open links to scan them), then says what happens next. A
 * used, expired or broken link reads the same, and nothing here names the account.
 */
export function ContactRevertScreen(props: ContactRevertScreenProps) {
  return <ContactRevertContent {...props} />;
}

/** Previews start at a later step, or with an answer already shown. */
export function ContactRevertContent({ data, handlers, initialStep, initialResult }: ContactRevertScreenProps & { initialStep?: Step; initialResult?: ActionResult }) {
  const t = useTranslations('account.notMe');
  const [step, setStep] = useState<Step>(initialStep ?? data.state);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // A new step is announced: focus goes to its heading (not on the first render).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    let outcome: ActionResult;
    try {
      outcome = await handlers.onConfirm();
    } catch {
      outcome = { ok: false, code: 'unknown' };
    }
    setPending(false);
    moved.current = true;
    if (outcome.ok) setStep('done');
    else if (outcome.code === 'not_found') setStep('invalid');
    else setResult(outcome);
  }

  const Icon = step === 'ask' ? ShieldAlert : step === 'done' ? ShieldCheck : CircleAlert;
  const steps = step === 'ask' ? (['signOut', 'undo', 'signIns', 'pause'] as const) : step === 'done' ? (['team', 'signIn', 'more'] as const) : (['contact'] as const);
  const contact = <Link href={routes.helpContact()} className={cn(buttonVariants({ variant: step === 'invalid' ? 'default' : 'outline' }), 'w-full sm:w-auto')}>{t('contactSupport')}</Link>;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-gutter py-12 sm:py-16">
      <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-full', step === 'done' ? 'bg-success/10 text-success' : 'bg-secondary text-secondary-foreground')}><Icon className="size-6" /></span>
      <p className="mt-6 text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
      <h1 ref={heading} tabIndex={-1} className="mt-2 font-heading text-2xl/8 font-bold text-balance outline-none sm:text-[28px]/9">{t(`${step}.title`)}</h1>
      <p className="mt-3 text-muted-foreground">{t(`${step}.text`, { days: CONTACT_REVERT_DAYS })}</p>
      <section aria-labelledby="not-me-next" className="mt-6 rounded-2xl border border-foreground/[0.08] p-4 sm:p-5 dark:border-white/[0.07]">
        <h2 id="not-me-next" className="font-heading text-base font-semibold">{t(`${step}.listTitle`)}</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          {steps.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0">{t(`${step}.items.${item}`, { days: CONTACT_REVERT_DAYS })}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-4">
        <FormFeedback result={result} />
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {step === 'ask' && (
          <Button type="button" disabled={pending} aria-busy={pending} className="w-full sm:w-auto" onClick={() => void confirm()}>
            {pending && <Spinner aria-hidden="true" />}{pending ? t('ask.working') : t('ask.confirm')}
          </Button>
        )}
        {step === 'done' && <Link href={routes.signIn()} className={cn(buttonVariants({ variant: 'default' }), 'w-full sm:w-auto')}>{t('done.signIn')}</Link>}
        {contact}
      </div>
      {step === 'ask' && <p className="mt-4 text-sm text-muted-foreground">{t('ask.madeIt')}</p>}
    </div>
  );
}
