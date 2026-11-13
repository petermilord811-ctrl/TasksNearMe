'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { oneTimeCodeInputSchema, type OneTimeCodeInput, type StaffVerifyHandlers, type StaffVerifyPageData } from '@/contracts';
import { CodeFormField } from '@/ui/components/forms/code-input';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const setupCodeSchema = z.object({ setupCode: z.string().trim().min(8, 'required').max(20, 'invalid') });

/** The staff two-step check: the authenticator's code, or setting the authenticator up. */
export function StaffVerifyScreen({ data, handlers }: { data: StaffVerifyPageData; handlers: StaffVerifyHandlers }) {
  const t = useTranslations('staffVerify');
  return <main id="main" className="mx-auto w-full max-w-reading space-y-6 px-gutter py-section">
    <header className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4" />{t('eyebrow', { name: data.displayName })}</p>
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t(`titles.${data.step}`)}</h1>
      <p className="text-muted-foreground">{t(`descriptions.${data.step}`)}</p>
    </header>
    {data.step === 'code' && <CodeForm onSubmit={handlers.onVerifyCode} label={t('code')} hint={t('codeHint')} submit={t('verify')} />}
    {data.step === 'code' && data.canEnroll && <EnrollLater onSubmit={handlers.onRedeemSetupCode} />}
    {data.step === 'setup_code' && <SetupCodeForm onSubmit={handlers.onRedeemSetupCode} />}
    {data.step === 'enroll' && <section className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
        <li>{t('enroll.app')}</li>
        <li>{t('enroll.add')}</li>
        <li>{t('enroll.confirm')}</li>
      </ol>
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium"><KeyRound aria-hidden="true" className="size-4" />{t('enroll.key')}</p>
        {/* Wraps only between the groups of four, so a group is never split across lines. */}
        <p className="break-words rounded-lg border bg-background p-3 font-mono text-base tracking-wider tabular-nums">{data.secret.match(/.{1,4}/g)?.join(' ')}</p>
        <a href={data.otpauthUri} className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline underline-offset-4"><Smartphone aria-hidden="true" className="size-4" />{t('enroll.openApp')}</a>
      </div>
      <CodeForm onSubmit={handlers.onConfirmEnrollment} label={t('code')} hint={t('enroll.codeHint')} submit={t('enroll.submit')} />
    </section>}
    {data.devCodeAllowed && <p className="rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">{t('devCode')}</p>}
  </main>;
}

function CodeForm({ onSubmit, label, hint, submit }: { onSubmit: StaffVerifyHandlers['onVerifyCode']; label: string; hint: string; submit: string }) {
  const form = useForm<OneTimeCodeInput>({ resolver: zodResolver(oneTimeCodeInputSchema), defaultValues: { code: '' } });
  const action = useFormAction(form, { navigation: 'replace' });
  const pending = action.pending || form.formState.isSubmitting;
  const run = form.handleSubmit(async (input) => { await action.run(onSubmit, input); });
  // No submit on the sixth digit here: staff press Verify (codes roll over every 30 seconds).
  return <form noValidate onSubmit={run} aria-busy={pending} className="space-y-5">
    <CodeFormField control={form.control} name="code" label={label} hint={hint} disabled={pending} autoFocus />
    <FormFeedback result={action.result} />
    <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{submit}</Button>
  </form>;
}

/** Development: the code step, with setting up a real authenticator one click away. */
function EnrollLater({ onSubmit }: { onSubmit: StaffVerifyHandlers['onRedeemSetupCode'] }) {
  const t = useTranslations('staffVerify');
  const [open, setOpen] = useState(false);
  return <section className="space-y-3 border-t pt-5">
    {open ? <SetupCodeForm onSubmit={onSubmit} /> : <Button type="button" variant="outline" onClick={() => setOpen(true)}>{t('enrollInstead')}</Button>}
  </section>;
}

function SetupCodeForm({ onSubmit }: { onSubmit: StaffVerifyHandlers['onRedeemSetupCode'] }) {
  const t = useTranslations('staffVerify');
  const [done, setDone] = useState(false);
  const form = useForm<{ setupCode: string }>({ resolver: zodResolver(setupCodeSchema), defaultValues: { setupCode: '' } });
  const action = useFormAction(form, { onResult: (result) => { if (result.ok) setDone(true); } });
  const pending = action.pending || form.formState.isSubmitting || done;
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(onSubmit, input); })} aria-busy={pending} className="space-y-5 rounded-xl border bg-card p-4 shadow-card sm:p-6">
    <TextFormField control={form.control} name="setupCode" label={t('setupCode')} hint={t('setupCodeHint')} autoComplete="off" />
    <FormFeedback result={action.result} />
    <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t('continue')}</Button>
  </form>;
}
