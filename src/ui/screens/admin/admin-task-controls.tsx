'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import {
  taskModerationInputSchema,
  type ActionResult,
  type AdminTaskHandlers,
  type AdminTaskPageData,
  type CategorySlug,
  type TaskModerationActionId,
  type TaskModerationInput,
} from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { adminSelect } from './admin-ui';

interface ModerationValues {
  reason: string;
  photoId: string;
  categorySlug: string;
}

export interface AdminTaskPreviewState {
  initialDialog?: TaskModerationActionId;
  initialValues?: Partial<ModerationValues>;
  initialResult?: ActionResult;
  initialPending?: boolean;
}

const selectClass = adminSelect;

function ModerationForm({ actionId, data, handlers, onBusy, onCancel, onSuccess, initialValues, initialResult, initialPending = false }: {
  actionId: TaskModerationActionId;
  data: AdminTaskPageData;
  handlers: AdminTaskHandlers;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSuccess: (result: ActionResult) => void;
} & Omit<AdminTaskPreviewState, 'initialDialog'>) {
  const t = useTranslations('adminTask');
  const categories = useTranslations('helperCard.categories');
  const router = useRouter();
  const id = useId();
  const form = useForm<ModerationValues>({ defaultValues: { reason: '', photoId: '', categorySlug: '', ...initialValues } });
  const action = useFormAction(form, { initialResult, onResult: (result) => { if (result.ok) { onSuccess(result); router.refresh(); } } });
  const pending = action.pending || form.formState.isSubmitting || initialPending;
  const { errors } = form.formState;
  const reasonError = errors.reason?.message ? t(errors.reason.message === 'too_long' ? 'dialog.reasonTooLong' : 'dialog.reasonRequired') : undefined;
  const photoError = errors.photoId?.message ? t('dialog.photoRequired') : undefined;
  const categoryError = errors.categorySlug?.message ? t('dialog.categoryRequired') : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : undefined;

  const submit = form.handleSubmit(async (values) => {
    const input: TaskModerationInput =
      actionId === 'remove_photo'
        ? { action: actionId, photoId: values.photoId, reason: values.reason }
        : actionId === 'recategorize'
          ? { action: actionId, categorySlug: values.categorySlug as CategorySlug, reason: values.reason }
          : { action: actionId, reason: values.reason };
    const parsed = taskModerationInputSchema.safeParse(input);
    if (!parsed.success) {
      let first = true;
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field !== 'reason' && field !== 'photoId' && field !== 'categorySlug') continue;
        form.setError(field, { type: 'validate', message: issue.message }, { shouldFocus: first });
        first = false;
      }
      return;
    }
    onBusy(true);
    try {
      await action.run(handlers.onModerate, input);
    } finally {
      onBusy(false);
    }
  });

  return <form noValidate aria-label={t(`actions.${actionId}`)} aria-busy={pending} className="space-y-4" onSubmit={(event) => { if (pending) { event.preventDefault(); return; } void submit(event); }}>
    {actionId === 'remove_photo' && <fieldset className="space-y-2" aria-describedby={photoError ? `${id}-photo-error` : undefined}>
      <legend className="text-sm font-medium">{t('dialog.photo')}</legend>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{data.photos.map((photo, index) => <li key={photo.id}>
        <label className="block cursor-pointer space-y-1 rounded-xl border border-foreground/[0.1] p-1.5 transition-[border-color,box-shadow] duration-200 hover:border-foreground/[0.25] has-[:checked]:border-primary has-[:checked]:ring-[3px] has-[:checked]:ring-ring/30">
          {/* The visible "Photo N" names the choice; the thumbnail is decoration inside the label. */}
          <Image unoptimized src={photo.src} alt="" width={photo.width ?? 400} height={photo.height ?? 300} className="aspect-4/3 w-full rounded-md object-cover" />
          <span className="flex min-h-11 items-center gap-2 px-1 text-sm"><input type="radio" value={photo.id} disabled={pending} {...form.register('photoId')} className="size-4 accent-primary" />{t('dialog.photoOption', { number: index + 1 })}</span>
        </label>
      </li>)}</ul>
      {photoError && <p id={`${id}-photo-error`} className="text-sm font-medium text-destructive">{photoError}</p>}
    </fieldset>}
    {actionId === 'recategorize' && <Field data-invalid={Boolean(categoryError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-category`}>{t('dialog.category')}</FieldLabel>
      <select {...form.register('categorySlug')} id={`${id}-category`} disabled={pending} required aria-invalid={Boolean(categoryError)} aria-describedby={categoryError ? `${id}-category-error` : undefined} className={selectClass}>
        <option value="">{t('dialog.chooseCategory')}</option>
        {data.categories.map((slug) => <option key={slug} value={slug}>{categories(slug)}</option>)}
      </select>
      {categoryError && <FieldError id={`${id}-category-error`}>{categoryError}</FieldError>}
    </Field>}
    <Field data-invalid={Boolean(reasonError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-reason`}>{t('dialog.reason')}</FieldLabel>
      <FieldDescription id={`${id}-hint`}>{t('dialog.reasonHint')}</FieldDescription>
      <Textarea {...form.register('reason')} id={`${id}-reason`} required maxLength={1000} rows={4} disabled={pending} aria-invalid={Boolean(reasonError)} aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ''}`} />
      {reasonError && <FieldError id={`${id}-error`}>{reasonError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} errorMessage={feedback?.code === 'not_allowed' ? t('dialog.notAllowed') : undefined} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <AlertDialogCancel type="button" disabled={pending} onClick={onCancel}>{t('dialog.cancel')}</AlertDialogCancel>
      <Button type="submit" variant={actionId === 'close_task' || actionId === 'hide_task' ? 'destructive' : 'default'} disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dialog.pending' : `actions.${actionId}`)}</Button>
    </div>
  </form>;
}

/** The moderation buttons, each opening a confirmation that needs a reason (UI-033). Only `actions` show. */
export function AdminTaskControls({ data, handlers, initialDialog, ...state }: { data: AdminTaskPageData; handlers: AdminTaskHandlers } & AdminTaskPreviewState) {
  const t = useTranslations('adminTask');
  const [dialog, setDialog] = useState<TaskModerationActionId | undefined>(initialDialog);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(state.initialResult?.ok ? state.initialResult : undefined);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  const allowed = dialog !== undefined && data.actions.includes(dialog);
  const pending = busy || Boolean(allowed && state.initialPending);
  const formState = state.initialResult?.ok ? { ...state, initialResult: undefined } : state;

  if (data.actions.length === 0) return <p className="text-sm text-muted-foreground">{t('readOnly')}</p>;
  return <div className="space-y-3">
    <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-2">{data.actions.map((actionId) => <Button key={actionId} variant={actionId === 'close_task' ? 'destructive' : actionId === 'restore_task' ? 'default' : 'outline'} disabled={pending} aria-busy={pending && dialog === actionId} onClick={(event) => { trigger.current = event.currentTarget; setResult(undefined); setDialog(actionId); }}>
      {pending && dialog === actionId && <Spinner aria-hidden="true" />}{t(`actions.${actionId}`)}
    </Button>)}</div>
    <div ref={resultRegion} tabIndex={-1} className={cn('rounded-lg outline-offset-4', !result && 'sr-only')}><FormFeedback result={result} successMessage={t('updated')} /></div>
    <AlertDialog open={allowed} onOpenChange={(open) => { if (!open && !pending) setDialog(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); if (result?.ok) resultRegion.current?.focus(); else trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <AlertDialogHeader><AlertDialogTitle>{t(`actions.${dialog ?? 'hide_task'}`)}</AlertDialogTitle><AlertDialogDescription>{t(`descriptions.${dialog ?? 'hide_task'}`)}</AlertDialogDescription></AlertDialogHeader>
        {dialog && allowed && <ModerationForm key={dialog} actionId={dialog} data={data} handlers={handlers} onBusy={setBusy} onCancel={() => setDialog(undefined)} onSuccess={(next) => { setResult(next); setDialog(undefined); }} {...formState} />}
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
