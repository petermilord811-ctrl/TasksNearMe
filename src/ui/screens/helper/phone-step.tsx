'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Lock, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { oneTimeCodeInputSchema, phoneInputSchema, type HelperOnboardingHandlers, type OneTimeCodeInput, type PhoneInput, type VerificationSummary } from '@/contracts';
import { CodeFormField } from '@/ui/components/forms/code-input';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { formatUsPhone, normalizeUsPhone } from '@/shared/phone';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * The phone step of helper onboarding: the number, a texted 6-digit code, done. The same flow as the
 * account page's phone change; a number that's already verified shows as done. `inDialog` (2026-11-23): the check opened
 * over the page from the verified-helper reminder, under the dialog's own title; the right code closes it there.
 */
export function PhoneStep({ verification, handlers, initialSentTo, inDialog = false }: {
  verification: VerificationSummary;
  handlers: Pick<HelperOnboardingHandlers, 'onStartPhone' | 'onConfirmPhone'>;
  /** Previews: start on the code step for this number. */
  initialSentTo?: string;
  inDialog?: boolean;
}) {
  const t = useTranslations('verification.phoneStep');
  const [sentTo, setSentTo] = useState(initialSentTo);
  const [changing, setChanging] = useState(false);
  const verified = verification.phone.verified && !changing;

  return <section {...(inDialog ? { 'aria-label': t('title') } : { 'aria-labelledby': 'phone-step-title' })} className={inDialog ? 'space-y-5' : 'space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6'}>
    {!inDialog && <div className="flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Smartphone aria-hidden="true" className="size-5" /></span>
      <h2 id="phone-step-title" className="font-heading text-lg font-semibold">{t('title')}</h2>
    </div>}
    {verified ? <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-badge-success p-3 text-badge-success-foreground"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{t('verified', { last4: verification.phone.last4 ?? '' })}</p>
      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setChanging(true)}>{t('change')}</Button>
    </div> : <>
      <p className="text-sm leading-6 text-muted-foreground">{t('explanation')}</p>
      {sentTo ? <CodeForm
        sentTo={sentTo}
        onVerify={handlers.onConfirmPhone}
        onResend={() => handlers.onStartPhone({ phone: sentTo })}
        onBack={() => setSentTo(undefined)}
      /> : <NumberForm initial="" onSend={handlers.onStartPhone} onSent={setSentTo} />}
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
    </>}
  </section>;
}

function NumberForm({ initial, onSend, onSent }: { initial: string; onSend: HelperOnboardingHandlers['onStartPhone']; onSent: (phone: string) => void }) {
  const t = useTranslations('verification.phoneStep');
  const form = useForm<PhoneInput>({ resolver: zodResolver(phoneInputSchema), defaultValues: { phone: initial } });
  const action = useFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  return <form noValidate aria-busy={pending} className="space-y-5" onSubmit={form.handleSubmit(async (input) => {
    const result = await action.run(onSend, input);
    if (result?.ok) onSent(input.phone.trim());
  })}>
    <TextFormField control={form.control} name="phone" label={t('numberLabel')} hint={t('numberHint')} type="tel" autoComplete="tel" />
    <FormFeedback result={action.result} />
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t('send')}</Button>
  </form>;
}

function CodeForm({ sentTo, onVerify, onResend, onBack }: {
  sentTo: string;
  onVerify: HelperOnboardingHandlers['onConfirmPhone'];
  onResend: () => ReturnType<HelperOnboardingHandlers['onStartPhone']>;
  onBack: () => void;
}) {
  const t = useTranslations('verification.phoneStep');
  const form = useForm<OneTimeCodeInput>({ resolver: zodResolver(oneTimeCodeInputSchema), defaultValues: { code: '' } });
  // In the check's dialog, the right code closes it (the setup flow's next step is a page of its own): said as a toast.
  const action = useFormAction(form, { successToast: t('verifiedNow') });
  const [last, setLast] = useState<'verify' | 'resend'>('verify');
  const pending = action.pending || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (input) => {
    setLast('verify');
    await action.run(onVerify, { code: input.code });
  });
  return <form noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
    {/* The number as people write it, however it was typed (journeys on a phone, J-H4: "3526131119"). */}
    <p className="leading-6">{t.rich('codeSent', { phone: formatUsPhone(normalizeUsPhone(sentTo) ?? sentTo), strong: (chunks) => <strong className="font-medium whitespace-nowrap tabular-nums">{chunks}</strong> })}</p>
    <CodeFormField control={form.control} name="code" label={t('codeLabel')} hint={t('codeHint')} disabled={pending} autoFocus onComplete={() => { if (!pending) void submit(); }} />
    <FormFeedback result={action.result} successMessage={action.result?.ok && last === 'resend' ? t('newCodeSent') : action.result?.ok ? t('verifiedNow') : undefined} />
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button type="submit" disabled={pending} aria-busy={pending && last === 'verify'}>{pending && last === 'verify' && <Spinner aria-hidden="true" />}{t('verify')}</Button>
      <Button type="button" variant="outline" disabled={pending} aria-busy={pending && last === 'resend'} onClick={async () => {
        setLast('resend');
        form.reset({ code: '' });
        await action.run(onResend, undefined);
      }}>{pending && last === 'resend' && <Spinner aria-hidden="true" />}{t('resend')}</Button>
      <Button type="button" variant="ghost" disabled={pending} className="whitespace-normal" onClick={onBack}>{t('different')}</Button>
    </div>
  </form>;
}
