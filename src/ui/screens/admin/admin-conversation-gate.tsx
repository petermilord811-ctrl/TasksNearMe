'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyhole } from 'lucide-react';
import { restrictedAccessInputSchema, type ActionResult, type AdminCaseHandlers, type AdminCasePageData, type AdminConversationView, type ISODateTime, type RestrictedAccessInput } from '@/contracts';
import { formatDateTime, formatRelative } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { CasePhoto } from '@/ui/components/support/case-photo';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export function AdminConversationGate({ context, onRevealConversation, now, initialConversation, initialOpen = false, initialResult }: {
  context: NonNullable<AdminCasePageData['context']>;
  onRevealConversation: AdminCaseHandlers['onRevealConversation'];
  now: ISODateTime;
  /** Preview-only seeds; the application screen never supplies these. */
  initialConversation?: AdminConversationView;
  initialOpen?: boolean;
  initialResult?: ActionResult;
}) {
  const t = useTranslations('adminCase.conversation');
  const fields = useTranslations('forms.fieldErrors');
  const id = useId();
  const [open, setOpen] = useState(initialOpen);
  const [conversation, setConversation] = useState(initialConversation);
  const reader = useRef<HTMLDivElement>(null);
  const form = useForm<RestrictedAccessInput>({ resolver: zodResolver(restrictedAccessInputSchema), defaultValues: { reason: '' } });
  const action = useFormAction(form, { initialResult });
  const code = form.formState.errors.reason?.message;
  const error = code === 'too_short' || code === 'required' ? t('reasonRequired') : code ? fields(fields.has(code) ? code : 'invalid') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;

  return <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <h2 className="text-xl font-semibold">{t('title')}</h2>
    <p className="text-sm font-medium">{context.title}</p>
    <Dialog open={open} onOpenChange={(next) => { if (!action.pending) setOpen(next); }}>
      {!conversation && <>
        <p className="text-sm text-muted-foreground">{t('gateHint')}</p>
        <DialogTrigger asChild><Button variant="outline" className="h-auto min-h-11 whitespace-normal"><LockKeyhole aria-hidden="true" className="size-4 shrink-0" />{t('open')}</Button></DialogTrigger>
      </>}
      <DialogContent showCloseButton={!action.pending} className="max-h-[90dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none" onEscapeKeyDown={(event) => { if (action.pending) event.preventDefault(); }} onInteractOutside={(event) => { if (action.pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { if (conversation) { event.preventDefault(); reader.current?.focus(); } }}>
        <DialogHeader><DialogTitle>{t('open')}</DialogTitle><DialogDescription>{t('loggedHint')}</DialogDescription></DialogHeader>
        <form noValidate aria-label={t('open')} aria-busy={action.pending} className="space-y-4" onSubmit={(event) => {
          if (action.pending) { event.preventDefault(); return; }
          void form.handleSubmit((input) => action.run(async (values: RestrictedAccessInput) => {
            const result = await onRevealConversation(values);
            if (!result.ok) return result;
            setConversation(result.conversation);
            setOpen(false);
            form.reset();
            return { ok: true, code: 'updated' };
          }, input))(event);
        }}>
          <Field data-invalid={Boolean(error)} className="gap-2">
            <FieldLabel htmlFor={`${id}-reason`}>{t('reason')}</FieldLabel>
            <FieldDescription id={`${id}-hint`}>{t('reasonHint')}</FieldDescription>
            <Textarea {...form.register('reason')} id={`${id}-reason`} rows={4} maxLength={500} required disabled={action.pending} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} />
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <FormFeedback result={feedback} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={action.pending} onClick={() => setOpen(false)}>{t('cancel')}</Button><Button type="submit" disabled={action.pending} aria-busy={action.pending}>{action.pending && <Spinner aria-hidden="true" />}{t(action.pending ? 'opening' : 'submit')}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    {conversation && <div ref={reader} tabIndex={-1} className="space-y-4 rounded-lg outline-offset-4">
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-success"><LockKeyhole aria-hidden="true" className="size-4" />{t('logged')}</p>
      <h3 className="text-lg font-semibold">{conversation.title}</h3>
      <p className="text-sm text-muted-foreground">{t('people', { names: conversation.people.map(({ displayName }) => displayName).join(', ') })}</p>
      <ol aria-label={t('messages')} className="space-y-3">{conversation.messages.map((message) => <li key={message.id} className="space-y-2 rounded-lg border bg-background p-3">
        <p className="text-sm font-semibold">{message.sender?.displayName ?? t(message.kind === 'status' ? 'bookingUpdate' : 'system')}</p>
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
        {Boolean(message.photos?.length) && <ul aria-label={t('photos')} className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">{message.photos!.map((photo, index) => <li key={photo.id}><CasePhoto photo={photo} number={index + 1} count={message.photos!.length} sender={message.sender?.displayName ?? t('system')} /></li>)}</ul>}
        <time dateTime={message.at} title={formatRelative(message.at, now)} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(message.at)}</time>
      </li>)}</ol>
      {conversation.messages.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
    </div>}
  </section>;
}
