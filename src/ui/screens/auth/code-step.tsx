'use client';

import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { oneTimeCodeInputSchema, type OneTimeCodeInput } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { CodeFormField } from '@/ui/components/forms/code-input';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { useFormAction } from '@/ui/lib/use-form-action';
import { ContinueButton, StepHeading, type SignInStepProps } from './step-parts';

/** The clock only enables resend. It never submits or advances a step. */
function useResendCountdown(at?: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  return at ? now === null ? null : Math.max(0, Math.ceil((Date.parse(at) - now) / 1000)) : 0;
}

export function CodeStep({ data, handlers, initialResult, onResult, channel }: SignInStepProps & { channel: 'email' | 'phone' }) {
  const { formatDateTime, zoneName } = useFormat();
  const t = useTranslations('signIn');
  const fields = useTranslations('forms.fields');
  const id = useId();
  const form = useForm<OneTimeCodeInput>({ resolver: zodResolver(oneTimeCodeInputSchema), defaultValues: { code: '' } });
  const action = useFormAction(form, { initialResult, onResult, navigation: 'replace' });
  const seconds = useResendCountdown(data.resendAvailableAt);
  const [pendingAction, setPendingAction] = useState<'verify' | 'resend' | 'change'>('verify');
  const pending = action.pending || form.formState.isSubmitting;
  const verify = channel === 'email' ? handlers.onVerifyEmailCode : handlers.onVerifyPhoneCode;
  const resend = channel === 'email' ? handlers.onResendEmailCode : handlers.onResendPhoneCode;
  const change = channel === 'email' ? handlers.onChangeEmail : handlers.onChangePhone;
  const submit = form.handleSubmit(async (input) => { setPendingAction('verify'); await action.run(verify, input); });
  return <form noValidate onSubmit={submit} aria-busy={pending} className="space-y-6">
    <StepHeading title={channel === 'email' ? t('emailCode.title') : t('phoneCode.title', { phone: data.maskedPhone ?? '' })}>
      {channel === 'email' && <p className="break-words">{t.rich('emailCode.description', { email: data.email ?? '', strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong> })}</p>}
      {data.codeLifetimeMinutes !== undefined && <p>{t('codeLifetime', { minutes: data.codeLifetimeMinutes })}</p>}
    </StepHeading>
    {/* The sixth digit sends the code, as other apps do (Continue stays for anyone who prefers it). */}
    <CodeFormField control={form.control} name="code" label={fields('code.label')} hint={fields('code.hint')} autoFocus disabled={pending} onComplete={() => { if (!pending) void submit(); }} />
    <FormFeedback result={action.result} successMessage={action.result?.ok && action.result.code === 'sent' ? t(pendingAction === 'resend' ? 'newCodeSent' : 'codeSent') : undefined} />
    <ContinueButton pending={pending} />
    <div className="space-y-2 border-t border-border pt-4">
      <Button type="button" variant="outline" disabled={pending || seconds === null || seconds > 0} aria-busy={action.pending && pendingAction === 'resend'} aria-describedby={data.resendAvailableAt ? `${id}-resend` : undefined} className="w-full" onClick={async () => { setPendingAction('resend'); await action.run(resend, undefined); }}>
        {action.pending && pendingAction === 'resend' && <Spinner aria-hidden="true" />}{t('resend')}
      </Button>
      {data.resendAvailableAt && <p id={`${id}-resend`} className="text-center text-sm tabular-nums text-muted-foreground">{seconds === null ? t('resendAt', { zone: zoneName, at: formatDateTime(data.resendAvailableAt) }) : seconds > 0 ? t('resendCountdown', { seconds }) : t('resendReady')}</p>}
      <Button type="button" variant="ghost" disabled={pending} aria-busy={action.pending && pendingAction === 'change'} className="w-full whitespace-normal" onClick={async () => { setPendingAction('change'); await action.run(change, undefined); }}>
        {action.pending && pendingAction === 'change' && <Spinner aria-hidden="true" />}{t(channel === 'email' ? 'changeEmail' : 'changePhone')}
      </Button>
    </div>
  </form>;
}
