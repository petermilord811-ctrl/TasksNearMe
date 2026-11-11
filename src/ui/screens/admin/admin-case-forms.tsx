'use client';

import { useId, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  caseStatusInputSchema, staffNoteInputSchema, staffReplyInputSchema,
  type ActionResult, type AdminCaseHandlers, type AdminCasePageData,
  type CaseStatusInput, type StaffNoteInput, type StaffReplyInput,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive';

function CaseField({ id, label, hint, error, children }: { id: string; label: string; hint: string; error?: string; children: ReactNode }) {
  return <Field data-invalid={Boolean(error)} className="gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
    {children}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}

export function AdminCaseFeedback({ result, successMessage }: { result?: ActionResult; successMessage?: string }) {
  const t = useTranslations('adminCase');
  const router = useRouter();
  const error = result && !result.ok ? result : undefined;
  return <div className="space-y-2">
    <FormFeedback result={error ? { ...error, fieldErrors: undefined } : result} successMessage={successMessage} errorMessage={error?.code === 'not_allowed' ? t('notAllowed') : error?.code === 'version_conflict' ? t('conflict') : undefined} />
    {error?.code === 'version_conflict' && <Button type="button" variant="outline" onClick={() => router.refresh()}>{t('refresh')}</Button>}
  </div>;
}

function useCaseForm<T extends FieldValues>(form: UseFormReturn<T>, options: { initialResult?: ActionResult; onSuccess?: (result: ActionResult) => void } = {}) {
  const router = useRouter();
  return useFormAction(form, { initialResult: options.initialResult, onResult: (result) => {
    if (result.ok) { options.onSuccess?.(result); router.refresh(); }
  } });
}

function useFieldCopy() {
  const t = useTranslations('forms.fieldErrors');
  return (code?: string) => code ? t(t.has(code) ? code : 'invalid') : undefined;
}

export interface AdminReplyState { initialResult?: ActionResult; initialBody?: string; initialPending?: boolean }

export function AdminReplyForm({ data, handlers, focusId, initialResult, initialBody = '', initialPending = false }: {
  data: AdminCasePageData; handlers: AdminCaseHandlers; focusId: string;
} & AdminReplyState) {
  const t = useTranslations('adminCase');
  const fieldCopy = useFieldCopy();
  const id = useId();
  const form = useForm<StaffReplyInput>({ resolver: zodResolver(staffReplyInputSchema), defaultValues: { partyId: '', body: initialBody } });
  const action = useCaseForm(form, { initialResult, onSuccess: (result) => { if (result.ok && result.code === 'sent') form.reset({ partyId: form.getValues('partyId'), body: '' }); } });
  const pending = action.pending || form.formState.isSubmitting || initialPending;
  const personCode = form.formState.errors.partyId?.message;
  const bodyCode = form.formState.errors.body?.message;
  const personError = personCode === 'required' ? t('reply.personRequired') : fieldCopy(personCode);
  const bodyError = bodyCode === 'required' ? t('reply.bodyRequired') : bodyCode === 'too_long' ? t('reply.bodyTooLong') : fieldCopy(bodyCode);
  return <form noValidate aria-label={t('reply.title')} aria-busy={pending} className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-5" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { await action.run(handlers.onReply, input); })(event);
  }}>
    <h2 className="text-xl font-semibold">{t('reply.title')}</h2>
    <fieldset disabled={pending} className="space-y-4">
      <legend className="sr-only">{t('reply.title')}</legend>
      <CaseField id={focusId} label={t('reply.person')} hint={t('reply.personHint')} error={personError}>
        <select {...form.register('partyId')} id={focusId} required aria-invalid={Boolean(personError)} aria-describedby={`${focusId}-hint${personError ? ` ${focusId}-error` : ''}`} className={selectClass}>
          <option value="">{t('reply.choosePerson')}</option>
          {data.parties.filter((party) => party.canMessage).map(({ person }) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
      </CaseField>
      <CaseField id={`${id}-body`} label={t('reply.body')} hint={t('reply.bodyHint')} error={bodyError}>
        <Textarea {...form.register('body')} id={`${id}-body`} required rows={5} maxLength={4000} aria-invalid={Boolean(bodyError)} aria-describedby={`${id}-body-hint${bodyError ? ` ${id}-body-error` : ''}`} />
      </CaseField>
    </fieldset>
    <AdminCaseFeedback result={action.result} successMessage={action.result?.ok && action.result.code === 'sent' ? t('reply.sent') : undefined} />
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'reply.sending' : 'reply.send')}</Button>
  </form>;
}

export function AdminNoteForm({ handlers, focusId }: { handlers: AdminCaseHandlers; focusId: string }) {
  const t = useTranslations('adminCase');
  const fieldCopy = useFieldCopy();
  const form = useForm<StaffNoteInput>({ resolver: zodResolver(staffNoteInputSchema), defaultValues: { body: '' } });
  const action = useCaseForm(form, { onSuccess: (result) => { if (result.ok && result.code === 'saved') form.reset({ body: '' }); } });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.body?.message;
  const error = code === 'required' ? t('note.bodyRequired') : code === 'too_long' ? t('note.bodyTooLong') : fieldCopy(code);
  return <form noValidate aria-label={t('note.title')} aria-busy={pending} className="space-y-4 rounded-xl border border-warning/30 bg-card p-4 shadow-card sm:p-5" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { await action.run(handlers.onAddNote, input); })(event);
  }}>
    <h2 className="text-xl font-semibold">{t('note.title')}</h2>
    <CaseField id={focusId} label={t('note.body')} hint={t('note.bodyHint')} error={error}>
      <Textarea {...form.register('body')} id={focusId} required rows={5} maxLength={4000} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={`${focusId}-hint${error ? ` ${focusId}-error` : ''}`} />
    </CaseField>
    <AdminCaseFeedback result={action.result} successMessage={action.result?.ok && action.result.code === 'saved' ? t('note.saved') : undefined} />
    <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t(pending ? 'note.saving' : 'note.save')}</Button>
  </form>;
}

type DialogFormProps = { data: AdminCasePageData; handlers: AdminCaseHandlers; onSuccess: (result: ActionResult) => void; onBusy: (busy: boolean) => void; onCancel: () => void };

export function AdminStatusForm({ data, handlers, onSuccess, onBusy, onCancel }: DialogFormProps) {
  const t = useTranslations('adminCase');
  const statusCopy = useTranslations('status.case');
  const fieldCopy = useFieldCopy();
  const id = useId();
  const form = useForm<CaseStatusInput>({ resolver: zodResolver(caseStatusInputSchema) });
  const action = useCaseForm(form, { onSuccess });
  const pending = action.pending || form.formState.isSubmitting;
  const code = form.formState.errors.status?.message;
  const error = code === 'required' ? t('status.required') : fieldCopy(code);
  return <form noValidate aria-label={t('status.title')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { onBusy(true); try { await action.run(handlers.onSetStatus, input); } finally { onBusy(false); } })(event);
  }}>
    <CaseField id={id} label={t('status.label')} hint={t('status.hint')} error={error}>
      <select {...form.register('status')} id={id} defaultValue="" disabled={pending} required aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className={selectClass}>
        <option value="">{t('status.choose')}</option>
        {data.nextStatuses.map((status) => <option key={status} value={status}>{statusCopy(status)}</option>)}
      </select>
    </CaseField>
    <AdminCaseFeedback result={action.result} />
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t('cancel')}</Button><Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'working' : 'status.save')}</Button></div>
  </form>;
}
