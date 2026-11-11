'use client';

import { useId, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useFormContext, type FieldPath } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { CompletionHandlers, CompletionInput, CompletionRules, Photo } from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { EvidencePhotoPicker } from '@/ui/components/bookings/evidence-photo-picker';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';

function CompletionField({ name, label, hint, children }: { name: FieldPath<CompletionInput>; label: string; hint: string; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = useId();
  const { getFieldState, formState } = useFormContext<CompletionInput>();
  const code = getFieldState(name, formState).error?.message;
  const t = useTranslations('forms');
  return <Field data-invalid={!!code} className="gap-2"><FieldLabel htmlFor={id}>{label}</FieldLabel>{children(id, !!code)}<FieldDescription id={`${id}-hint`}>{hint}</FieldDescription><div id={`${id}-error`} aria-live="polite">{code && <FieldError>{t(t.has(`fieldErrors.${code}`) ? `fieldErrors.${code}` : 'fieldErrors.invalid')}</FieldError>}</div></Field>;
}

function ReceiptRow({ index, rules, onUploadPhoto, onBusyChange, onRemove }: { index: number; rules: CompletionRules; onUploadPhoto: CompletionHandlers['onUploadPhoto']; onBusyChange: (busy: boolean) => void; onRemove: () => void }) {
  const t = useTranslations('bookingComplete');
  const errors = useTranslations('forms');
  const { register, control, getFieldState, formState } = useFormContext<CompletionInput>();
  const rowError = getFieldState(`expenses.${index}`, formState).error?.message;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editing, setEditing] = useState<{ cents: number; raw: string }>();
  const id = useId();
  return <div role="group" aria-labelledby={`${id}-title`} tabIndex={rowError ? -1 : undefined} data-field-invalid={!!rowError} aria-describedby={rowError ? `${id}-error` : undefined} className="space-y-4 rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-title`} className="font-heading text-lg font-semibold">{t('expenses.item', { number: index + 1 })}</h3><Button type="button" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" className="size-4" />{t('expenses.remove', { number: index + 1 })}</Button></div>
    {rowError && <FieldError id={`${id}-error`}>{errors(errors.has(`fieldErrors.${rowError}`) ? `fieldErrors.${rowError}` : 'fieldErrors.invalid')}</FieldError>}
    <CompletionField name={`expenses.${index}.description`} label={t('expenses.description')} hint={t('expenses.descriptionHint')}>{(fieldId, invalid) => <Input {...register(`expenses.${index}.description`)} id={fieldId} maxLength={80} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} className="scroll-mb-40" />}</CompletionField>
    <CompletionField name={`expenses.${index}.amountCents`} label={t('expenses.amount')} hint={t('expenses.amountHint')}>{(fieldId, invalid) => <Controller control={control} name={`expenses.${index}.amountCents`} render={({ field }) => <Input id={fieldId} name={field.name} ref={field.ref} onBlur={field.onBlur} inputMode="decimal" className="scroll-mb-40 tabular-nums" aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} value={editing && Object.is(editing.cents, field.value) ? editing.raw : Number.isInteger(field.value) && field.value > 0 ? formatMoneyInput(field.value) : ''} onChange={(event) => { const raw = event.target.value; const cents = parseMoneyInput(raw) ?? -1; setEditing({ raw, cents }); field.onChange(cents); }} />} />}</CompletionField>
    <Controller control={control} name={`expenses.${index}.receiptPhotoId`} render={({ field, fieldState }) => <EvidencePhotoPicker id={`${id}-receipt`} label={t('expenses.photo')} hint={t('expenses.photoHint', { megabytes: rules.maxPhotoMegabytes })} photos={photos} inputRef={field.ref} error={fieldState.error ? errors(errors.has(`fieldErrors.${fieldState.error.message}`) ? `fieldErrors.${fieldState.error.message}` : 'fieldErrors.invalid') : undefined} onChange={(next) => { setPhotos(next); field.onChange(next[0]?.id ?? ''); }} maxPhotos={1} maxPhotoMegabytes={rules.maxPhotoMegabytes} onUploadPhoto={onUploadPhoto} onBusyChange={onBusyChange} />} />
  </div>;
}

export function CompletionFields({ rules, onUploadPhoto, onBusyChange, expensesCents }: { rules: CompletionRules; onUploadPhoto: CompletionHandlers['onUploadPhoto']; onBusyChange: (busy: boolean) => void; expensesCents: number }) {
  const t = useTranslations('bookingComplete');
  const errors = useTranslations('forms');
  const id = useId();
  const { register, control, watch, formState } = useFormContext<CompletionInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'expenses' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const note = watch('note');
  const expenseCode = formState.errors.expenses?.root?.message ?? formState.errors.expenses?.message;
  return <div className="space-y-6">
    {rules.photosMax > 0 && <Controller control={control} name="photoIds" render={({ field, fieldState }) => <EvidencePhotoPicker id={`${id}-photos`} label={t(rules.photosMin > 0 ? 'photos.label' : 'photos.optionalLabel')} hint={t('photos.hint', { minimum: rules.photosMin, maximum: rules.photosMax, megabytes: rules.maxPhotoMegabytes })} photos={photos} inputRef={field.ref} error={fieldState.error ? t(fieldState.error.message === 'required' ? 'photos.required' : 'photos.invalid', { minimum: rules.photosMin, maximum: rules.photosMax }) : undefined} onChange={(next) => { setPhotos(next); field.onChange(next.map((photo) => photo.id)); }} onUploadPhoto={onUploadPhoto} maxPhotos={rules.photosMax} maxPhotoMegabytes={rules.maxPhotoMegabytes} onBusyChange={onBusyChange} />} />}
    <CompletionField name="note" label={t(rules.noteRequired ? 'note' : 'noteOptional')} hint={t(rules.noteRequired ? 'noteHint' : 'noteOptionalHint')}>{(fieldId, invalid) => <><Textarea {...register('note')} id={fieldId} rows={4} maxLength={rules.noteMaxLength} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error ${fieldId}-count`} className="scroll-mb-40" /><p id={`${fieldId}-count`} className="text-right text-sm tabular-nums text-muted-foreground">{t('counter', { count: note.length, maximum: rules.noteMaxLength })}</p></>}</CompletionField>
    {rules.hours && <CompletionField name="hoursWorked" label={t('hours')} hint={t('hoursHint', { cap: rules.hours.cap })}>{(fieldId, invalid) => <Input {...register('hoursWorked', { setValueAs: (value: string) => value === '' ? undefined : Number(value) })} id={fieldId} type="number" inputMode="decimal" min={0.5} max={rules.hours?.cap} step={0.5} aria-invalid={invalid} aria-describedby={`${fieldId}-hint ${fieldId}-error`} className="max-w-sm scroll-mb-40 tabular-nums" />}</CompletionField>}
    {rules.expenses && <section aria-labelledby={`${id}-expenses`} className="space-y-4">
      <h2 id={`${id}-expenses`} className="font-heading text-xl font-semibold">{t('expenses.title')}</h2><p className="break-words text-sm text-muted-foreground">{rules.expenses.description}</p><p className="text-sm">{t('expenses.hint', { maximum: rules.expenses.maxItems })}</p>
      <div tabIndex={-1} aria-invalid={!!expenseCode} aria-describedby={`${id}-expense-error`} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><p className="rounded-lg bg-muted p-3 tabular-nums">{t('expenses.total', { total: formatMoney(expensesCents), allowance: formatMoney(rules.expenses.allowanceCents) })}</p><div id={`${id}-expense-error`} aria-live="polite">{expenseCode && <FieldError>{expenseCode === 'out_of_range' ? t('expenses.overAllowance', { allowance: formatMoney(rules.expenses.allowanceCents) }) : errors(errors.has(`fieldErrors.${expenseCode}`) ? `fieldErrors.${expenseCode}` : 'fieldErrors.invalid')}</FieldError>}</div></div>
      {fields.map((field, index) => <ReceiptRow key={field.id} index={index} rules={rules} onUploadPhoto={onUploadPhoto} onBusyChange={onBusyChange} onRemove={() => remove(index)} />)}
      <Button type="button" variant="outline" disabled={fields.length >= rules.expenses.maxItems} onClick={() => append({ description: '', amountCents: 0, receiptPhotoId: '' }, { shouldFocus: false })}><Plus aria-hidden="true" className="size-4" />{t('expenses.add')}</Button>
    </section>}
  </div>;
}
