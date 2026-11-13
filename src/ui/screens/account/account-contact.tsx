'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, CircleCheck, Mail, Phone } from 'lucide-react';
import {
  CONTACT_CODE_MINUTES,
  emailInputSchema,
  oneTimeCodeInputSchema,
  phoneInputSchema,
  type AccountHandlers,
  type AccountPageData,
  type ActionResult,
  type EmailInput,
  type FieldErrorCode,
  type OneTimeCodeInput,
  type PhoneInput,
} from '@/contracts';
import { CodeFormField } from '@/ui/components/forms/code-input';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';

type ContactHandlers = Pick<AccountHandlers, 'onStartEmailChange' | 'onConfirmEmailChange' | 'onStartPhoneChange' | 'onConfirmPhoneChange'>;
type Channel = 'email' | 'phone';

/**
 * Contact details: the email and the phone number, each changed (or the phone added) in a dialog. The
 * first step sends a 6-digit code to the new address or number; entering it (the sixth digit sends it)
 * makes the change. Until then nothing changes.
 */
export function AccountContact({ email, phone, handlers, initialDialog }: {
  email: string;
  phone?: AccountPageData['phone'];
  handlers: ContactHandlers;
  /** Previews only: open a dialog at a step, as if the code was just sent to `sentTo`. */
  initialDialog?: { channel: Channel; sentTo?: string };
}) {
  const t = useTranslations('account.contact');
  const router = useRouter();
  const [open, setOpen] = useState<Channel | null>(initialDialog?.channel ?? null);
  // Each opening starts over at the first step.
  const [opening, setOpening] = useState(0);
  const [done, setDone] = useState<{ channel: 'email'; email: string } | { channel: 'phone' }>();

  function show(channel: Channel) {
    setOpening((count) => count + 1);
    setDone(undefined);
    setOpen(channel);
  }

  function finished(next: { channel: 'email'; email: string } | { channel: 'phone' }) {
    setOpen(null);
    setDone(next);
    router.refresh();
  }

  const fromPreview = opening === 0 ? initialDialog?.sentTo : undefined;
  return (
    <div className="space-y-4">
      <div aria-live="polite" aria-atomic="true">
        {done && (
          <Alert role="status" className="border-success/30">
            <CircleCheck aria-hidden="true" className="text-success" />
            <AlertDescription className="break-words text-foreground">{done.channel === 'email' ? t('emailChanged', { email: done.email }) : t('phoneChanged')}</AlertDescription>
          </Alert>
        )}
      </div>
      <ul className="divide-y divide-foreground/[0.07] rounded-2xl border border-foreground/[0.08] dark:divide-white/[0.06] dark:border-white/[0.07]">
        {/* The icon, what it is, and its button on one line: the text takes the room left, the button never wraps under it. */}
        <li className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Mail className="size-4" /></span>
          <span className="min-w-0">
            <span className="block font-medium">{t('email')}</span>
            <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">{email}</span>
          </span>
          <Button type="button" variant="outline" aria-label={t('changeEmailLabel')} onClick={() => show('email')}>{t('change')}</Button>
        </li>
        <li className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            {phone?.verified ? <BadgeCheck className="size-4 text-success" /> : <Phone className="size-4" />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{t('phone')}</span>
            <span className="block text-sm tabular-nums text-muted-foreground">{phone ? t(phone.verified ? 'phoneVerified' : 'phoneUnverified', { last4: phone.last4 }) : t('noPhone')}</span>
          </span>
          <Button type="button" variant="outline" aria-label={t(phone ? 'changePhoneLabel' : 'addPhoneLabel')} onClick={() => show('phone')}>{t(phone ? 'change' : 'add')}</Button>
        </li>
      </ul>
      {!phone && <p className="text-sm text-muted-foreground">{t('noPhoneHint')}</p>}

      <ChangeDialog open={open === 'email'} onClose={() => setOpen(null)} title={t('emailDialog.title')}>
        <EmailChange key={`email-${opening}`} handlers={handlers} sentTo={fromPreview} onDone={(changed) => finished({ channel: 'email', email: changed })} />
      </ChangeDialog>
      <ChangeDialog open={open === 'phone'} onClose={() => setOpen(null)} title={t(phone ? 'phoneDialog.changeTitle' : 'phoneDialog.addTitle')}>
        <PhoneChange key={`phone-${opening}`} adding={!phone} handlers={handlers} sentTo={fromPreview} onDone={() => finished({ channel: 'phone' })} />
      </ChangeDialog>
    </div>
  );
}

function ChangeDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="leading-7">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Step 1 and 2 of changing the email. A field error on the address after the code (it was taken meanwhile) goes back to step 1. */
function EmailChange({ handlers, sentTo, onDone }: { handlers: ContactHandlers; sentTo?: string; onDone: (email: string) => void }) {
  const t = useTranslations('account.contact');
  const [target, setTarget] = useState(sentTo);
  const [addressError, setAddressError] = useState<FieldErrorCode>();
  const [typed, setTyped] = useState(sentTo ?? '');

  if (!target) {
    return (
      <EmailAddressStep
        description={t('emailDialog.description')}
        initial={typed}
        initialError={addressError}
        onSend={handlers.onStartEmailChange}
        onSent={(address) => { setTyped(address); setAddressError(undefined); setTarget(address); }}
      />
    );
  }
  return (
    <CodeStep
      channel="email"
      description={t.rich('emailDialog.codeDescription', { email: target, minutes: CONTACT_CODE_MINUTES, strong: (chunks) => <strong className="font-medium break-all text-foreground">{chunks}</strong> })}
      onVerify={async ({ code }) => {
        const result = await handlers.onConfirmEmailChange({ email: target, code });
        const lost = !result.ok ? result.fieldErrors?.email?.[0] : undefined;
        if (lost) {
          setAddressError(lost);
          setTarget(undefined);
        }
        return result;
      }}
      onResend={() => handlers.onStartEmailChange({ email: target })}
      onBack={() => setTarget(undefined)}
      onVerified={() => onDone(target)}
    />
  );
}

function PhoneChange({ adding, handlers, sentTo, onDone }: { adding: boolean; handlers: ContactHandlers; sentTo?: string; onDone: () => void }) {
  const t = useTranslations('account.contact');
  const [target, setTarget] = useState(sentTo);
  const [typed, setTyped] = useState(sentTo ?? '');

  if (!target) {
    return (
      <PhoneNumberStep
        description={t(adding ? 'phoneDialog.addDescription' : 'phoneDialog.description')}
        initial={typed}
        onSend={handlers.onStartPhoneChange}
        onSent={(number) => { setTyped(number); setTarget(number); }}
      />
    );
  }
  return (
    <CodeStep
      channel="phone"
      description={t.rich('phoneDialog.codeDescription', { phone: target, minutes: CONTACT_CODE_MINUTES, strong: (chunks) => <strong className="font-medium whitespace-nowrap text-foreground tabular-nums">{chunks}</strong> })}
      onVerify={(input) => handlers.onConfirmPhoneChange(input)}
      onResend={() => handlers.onStartPhoneChange({ phone: target })}
      onBack={() => setTarget(undefined)}
      onVerified={onDone}
    />
  );
}

/** Step 1 for the email: the new address, then "Send code". */
function EmailAddressStep({ description, initial, initialError, onSend, onSent }: {
  description: string;
  initial: string;
  /** The address was refused after the code was entered (another account took it meanwhile). */
  initialError?: FieldErrorCode;
  onSend: (input: EmailInput) => Promise<ActionResult>;
  onSent: (email: string) => void;
}) {
  const t = useTranslations('account.contact');
  const form = useForm<EmailInput>({ resolver: zodResolver(emailInputSchema), defaultValues: { email: initial } });
  const action = useFormAction(form);
  const { setError } = form;
  useEffect(() => {
    if (initialError) setError('email', { type: 'server', message: initialError }, { shouldFocus: true });
  }, [initialError, setError]);
  const pending = action.pending || form.formState.isSubmitting;
  return (
    <form
      noValidate
      aria-busy={pending}
      className="space-y-5"
      onSubmit={form.handleSubmit(async (input) => {
        const result = await action.run(onSend, input);
        if (result?.ok) onSent(input.email.trim().toLowerCase());
      })}
    >
      <DialogDescription className="leading-6">{description}</DialogDescription>
      <TextFormField control={form.control} name="email" label={t('emailDialog.label')} hint={t('emailDialog.hint')} type="email" autoComplete="email" inputMode="email" autoFocus />
      <FormFeedback result={action.result} />
      <SendButton pending={pending}>{t('emailDialog.send')}</SendButton>
    </form>
  );
}

/** Step 1 for the phone: the new number, then "Text me a code". */
function PhoneNumberStep({ description, initial, onSend, onSent }: {
  description: string;
  initial: string;
  onSend: (input: PhoneInput) => Promise<ActionResult>;
  onSent: (phone: string) => void;
}) {
  const t = useTranslations('account.contact');
  const fields = useTranslations('forms.fields');
  const form = useForm<PhoneInput>({ resolver: zodResolver(phoneInputSchema), defaultValues: { phone: initial } });
  const action = useFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  return (
    <form
      noValidate
      aria-busy={pending}
      className="space-y-5"
      onSubmit={form.handleSubmit(async (input) => {
        const result = await action.run(onSend, input);
        if (result?.ok) onSent(input.phone.trim());
      })}
    >
      <DialogDescription className="leading-6">{description}</DialogDescription>
      <TextFormField control={form.control} name="phone" label={fields('phone.label')} hint={fields('phone.hint')} type="tel" autoComplete="tel" autoFocus />
      <FormFeedback result={action.result} />
      <SendButton pending={pending}>{t('phoneDialog.send')}</SendButton>
    </form>
  );
}

function SendButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">{pending && <Spinner aria-hidden="true" />}{children}</Button>;
}

/** The 6 boxes, "Confirm", "Send a new code" and "Use a different …". */
function CodeStep({ channel, description, onVerify, onResend, onBack, onVerified }: {
  channel: Channel;
  description: ReactNode;
  onVerify: (input: { code: string }) => Promise<ActionResult>;
  onResend: () => Promise<ActionResult>;
  onBack: () => void;
  onVerified: () => void;
}) {
  const t = useTranslations('account.contact');
  const fields = useTranslations('forms.fields');
  const form = useForm<OneTimeCodeInput>({ resolver: zodResolver(oneTimeCodeInputSchema), defaultValues: { code: '' } });
  const action = useFormAction(form);
  const [last, setLast] = useState<'verify' | 'resend'>('verify');
  const pending = action.pending || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (input) => {
    setLast('verify');
    const result = await action.run(onVerify, { code: input.code });
    if (result?.ok) onVerified();
  });

  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
      <DialogDescription className="leading-6">{description}</DialogDescription>
      <CodeFormField control={form.control} name="code" label={fields('code.label')} hint={fields('code.hint')} autoFocus disabled={pending} onComplete={() => { if (!pending) void submit(); }} />
      <FormFeedback result={action.result} successMessage={action.result?.ok && last === 'resend' ? t('newCodeSent') : undefined} />
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending && last === 'verify'}>{pending && last === 'verify' && <Spinner aria-hidden="true" />}{t('confirm')}</Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-busy={pending && last === 'resend'}
          onClick={async () => {
            setLast('resend');
            form.reset({ code: '' });
            await action.run(onResend, undefined);
          }}
        >
          {pending && last === 'resend' && <Spinner aria-hidden="true" />}{t('resend')}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} className="whitespace-normal" onClick={onBack}>{t(channel === 'email' ? 'emailDialog.different' : 'phoneDialog.different')}</Button>
      </div>
    </form>
  );
}
