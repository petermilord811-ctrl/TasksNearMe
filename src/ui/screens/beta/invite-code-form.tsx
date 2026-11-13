'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { inviteCodeInputSchema, routes, type ActionResult, type InviteCodeInput, type RedeemInviteHandler } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * The invite code and "No code? Join the waitlist", shared by the sign-in `invite_code` step and the helper
 * invite screen. The server says whether the code works; the form only maps its answer to copy.
 */
export function InviteCodeForm({ code, onRedeem, submitLabel, initialResult, onResult }: {
  code?: string;
  onRedeem: RedeemInviteHandler;
  submitLabel: string;
  initialResult?: ActionResult;
  onResult?: (result: ActionResult) => void;
}) {
  const t = useTranslations('beta');
  const form = useForm<InviteCodeInput>({ resolver: zodResolver(inviteCodeInputSchema), defaultValues: { inviteCode: code ?? '' } });
  const action = useFormAction(form, { initialResult, ...(onResult ? { onResult } : {}), navigation: 'replace' });
  const pending = action.pending || form.formState.isSubmitting;
  return <div className="space-y-6">
    <form noValidate aria-busy={pending} className="space-y-6" onSubmit={form.handleSubmit(async (input) => { await action.run(onRedeem, input); })}>
      <TextFormField control={form.control} name="inviteCode" label={t('code.label')} hint={t('code.hint')} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={pending} className="font-mono uppercase tracking-[0.08em]" />
      <FormFeedback result={action.result} successMessage={t('code.accepted')} />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">{pending && <Spinner aria-hidden="true" />}{submitLabel}</Button>
    </form>
    <div className="space-y-1 rounded-2xl bg-muted/60 p-4 text-sm">
      <p className="font-medium text-foreground">{t('waitlist.title')}</p>
      <p className="text-muted-foreground">{t('waitlist.body')}</p>
      <Link href={routes.waitlist({ from: 'beta' })} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('waitlist.link')}</Link>
    </div>
  </div>;
}
