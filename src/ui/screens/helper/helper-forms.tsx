'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  createHelperServicesSchema, helperAreaInputSchema, helperProfileInputSchema, helperToolsInputSchema,
  SERVICE_RADIUS_MILES, type ActionHandler, type CategoryView, type HelperAreaInput,
  type HelperOnboardingPageData, type HelperProfileInput, type HelperServicesInput, type HelperToolsInput,
  type ProfileDraftInput, type ProfileDraftResult, type QueryHandler,
} from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { AiDraftButton, AiDraftStatus, type AiDraftOutcome } from '@/ui/components/forms/ai-draft';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';
import { useFormAction } from '@/ui/lib/use-form-action';

const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive';
const checkboxClass = 'size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function HelperField({ id, label, hint, error, errorText, children }: { id: string; label: string; hint?: ReactNode; error?: string; errorText?: string; children: ReactNode }) {
  const t = useTranslations('forms');
  const helper = useTranslations('helperOnboarding');
  return <Field data-invalid={!!error} className="gap-2">
    <FieldLabel htmlFor={id} className="text-foreground">{label}</FieldLabel>
    {children}
    {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
    {error && <FieldError id={`${id}-error`}>{errorText ?? (error === 'not_supported' ? helper('forms.unsupported') : t(t.has(`fieldErrors.${error}`) ? `fieldErrors.${error}` : 'fieldErrors.invalid'))}</FieldError>}
  </Field>;
}

/** Extend the shared result handling to nested service/tool field paths. */
function useHelperFormAction<T extends FieldValues>(form: UseFormReturn<T>) {
  const action = useFormAction(form);
  const result = action.result;
  const pending = action.pending || form.formState.isSubmitting;
  useEffect(() => {
    if (!result || result.ok || !result.fieldErrors || pending) return;
    let first = true;
    for (const [name, codes] of Object.entries(result.fieldErrors)) {
      const code = codes?.[0];
      if (!code) continue;
      form.setError(name as Path<T>, { type: 'server', message: code }, { shouldFocus: first });
      first = false;
    }
  }, [form, result, pending]);
  return action;
}

function SaveButton({ pending, label }: { pending: boolean; label?: string }) {
  const t = useTranslations('helperOnboarding');
  return <div className={label ? 'fixed inset-x-0 bottom-app-navigation z-20 border-t bg-card px-gutter pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0' : undefined}><div className="mx-auto max-w-reading"><Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner />}{pending ? t('forms.saving') : label ?? t('forms.save')}</Button></div></div>;
}

/**
 * "Write it for me": a few words about the helper go to `onDraft`, and the headline and about-me it returns
 * replace what's in the form (Undo puts it back). Nothing is saved until the form is.
 */
function ProfileDraftPanel({ onDraft, disabled, onDrafted, onUndo }: {
  onDraft: QueryHandler<ProfileDraftInput, ProfileDraftResult>;
  disabled: boolean;
  onDrafted: (draft: { headline: string; bio: string }) => void;
  onUndo: () => void;
}) {
  const t = useTranslations('helperOnboarding.forms.profile.ai');
  const id = useId();
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<AiDraftOutcome>();
  const [drafted, setDrafted] = useState(false);

  async function draft() {
    if (pending) return;
    setPending(true);
    setOutcome(undefined);
    let result: ProfileDraftResult;
    try {
      result = await onDraft({ notes: notes.trim() });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    setPending(false);
    if (!result.ok) {
      setOutcome({ kind: 'failed', code: result.code });
      return;
    }
    setDrafted(true);
    onDrafted(result.draft);
    setOutcome({ kind: 'drafted' });
  }

  return <div role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="space-y-3 rounded-xl border border-dashed bg-accent/40 p-4">
    <p id={`${id}-title`} className="flex items-center gap-2 font-medium"><Sparkles aria-hidden="true" className="size-4 text-primary" />{t('title')}</p>
    <p id={`${id}-description`} className="text-sm text-muted-foreground">{t('description')}</p>
    <HelperField id={`${id}-notes`} label={t('notes')} hint={t('notesHint')}>
      <Textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={600} rows={2} disabled={disabled || pending} aria-describedby={`${id}-notes-hint`} />
    </HelperField>
    <AiDraftButton pending={pending} disabled={disabled} onClick={() => void draft()}>{t(drafted ? 'redraft' : 'draft')}</AiDraftButton>
    <AiDraftStatus outcome={outcome} onUndo={() => { onUndo(); setOutcome({ kind: 'undone' }); }} />
  </div>;
}

export function HelperProfileForm({ values, languageOptions, onSave, onDraft, submitLabel }: {
  values: HelperProfileInput; languageOptions: HelperOnboardingPageData['languageOptions']; onSave: ActionHandler<HelperProfileInput>; submitLabel?: string;
  /** "Write it for me", when drafting is on for this person. */
  onDraft?: QueryHandler<ProfileDraftInput, ProfileDraftResult>;
}) {
  const t = useTranslations('helperOnboarding');
  const fields = useTranslations('forms');
  const id = useId();
  const form = useForm<HelperProfileInput>({ resolver: zodResolver(helperProfileInputSchema), defaultValues: values });
  const action = useHelperFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  const headline = useWatch({ control: form.control, name: 'headline' });
  const bio = useWatch({ control: form.control, name: 'bio' });
  // What the draft replaced, for Undo.
  const [beforeDraft, setBeforeDraft] = useState<{ headline: string; bio: string }>();
  const fill = (next: { headline: string; bio: string }) => {
    form.setValue('headline', next.headline, { shouldDirty: true, shouldValidate: true });
    form.setValue('bio', next.bio, { shouldDirty: true, shouldValidate: true });
  };
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(onSave, input); })} aria-busy={pending} className="space-y-6">
    <p className="rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">{t('forms.profile.privacy')}</p>
    {onDraft && <ProfileDraftPanel
      onDraft={onDraft}
      disabled={pending}
      onDrafted={(draft) => {
        setBeforeDraft((kept) => kept ?? { headline: form.getValues('headline'), bio: form.getValues('bio') });
        fill(draft);
      }}
      onUndo={() => {
        if (beforeDraft) fill(beforeDraft);
        setBeforeDraft(undefined);
      }}
    />}
    <fieldset disabled={pending} className="space-y-6">
      <legend className="sr-only">{t('forms.profile.title')}</legend>
      <div className="space-y-2"><TextFormField control={form.control} name="headline" label={t('forms.profile.headline')} hint={t('forms.profile.headlineHint')} maxLength={80} /><p className="text-right text-sm tabular-nums text-muted-foreground">{t('forms.counter', { count: headline.length, maximum: 80 })}</p></div>
      <Controller name="bio" control={form.control} render={({ field, fieldState }) => <HelperField id={`${id}-bio`} label={t('forms.profile.bio')} hint={<span className="flex flex-wrap justify-between gap-2"><span>{t('forms.profile.bioHint')}</span><span className="tabular-nums">{t('forms.counter', { count: bio.length, maximum: 1000 })}</span></span>} error={fieldState.error?.message}>
        <Textarea {...field} id={`${id}-bio`} maxLength={1000} rows={5} aria-invalid={fieldState.invalid} aria-describedby={`${id}-bio-hint${fieldState.error ? ` ${id}-bio-error` : ''}`} />
      </HelperField>} />
      <Controller name="languages" control={form.control} render={({ field, fieldState }) => <fieldset aria-describedby={`${id}-languages-hint${fieldState.error ? ` ${id}-languages-error` : ''}`} className="space-y-2">
        <legend className="text-sm font-medium">{t('forms.profile.languages')}</legend>
        <p id={`${id}-languages-hint`} className="text-sm text-muted-foreground">{t('forms.profile.languagesHint')}</p>
        <div className="grid grid-cols-2 gap-x-4">{languageOptions.map((language, index) => <label key={language.code} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name={field.name} ref={index === 0 ? field.ref : undefined} checked={field.value.includes(language.code)} onBlur={field.onBlur} onChange={(event) => field.onChange(event.target.checked ? [...field.value, language.code] : field.value.filter((code) => code !== language.code))} aria-invalid={fieldState.invalid} aria-describedby={`${id}-languages-hint${fieldState.error ? ` ${id}-languages-error` : ''}`} className={checkboxClass} />{language.name}
        </label>)}</div>
        {fieldState.error && <FieldError id={`${id}-languages-error`}>{fields(`fieldErrors.${fieldState.error.message ?? 'invalid'}`)}</FieldError>}
      </fieldset>} />
    </fieldset>
    <FormFeedback result={action.result} successMessage={t('forms.saved')} />
    <SaveButton pending={pending} label={submitLabel} />
  </form>;
}

function ServiceMoneyField({ form, name, label, hint }: { form: UseFormReturn<HelperServicesInput>; name: `services.${number}.fromPriceCents` | `services.${number}.hourlyRateCents`; label: string; hint: string }) {
  const id = useId();
  const [editing, setEditing] = useState<{ cents: number; raw: string }>();
  return <Controller name={name} control={form.control} render={({ field, fieldState }) => <HelperField id={id} label={label} hint={hint} error={fieldState.error?.message}>
    <Input ref={field.ref} name={field.name} id={id} inputMode="decimal" onBlur={field.onBlur} value={editing && Object.is(editing.cents, field.value) ? editing.raw : typeof field.value === 'number' && field.value >= 0 && Number.isInteger(field.value) ? formatMoneyInput(field.value) : ''} onChange={(event) => {
      const raw = event.target.value;
      const cents = parseMoneyInput(raw) ?? -1;
      setEditing({ cents, raw });
      field.onChange(cents);
    }} aria-invalid={fieldState.invalid} aria-describedby={`${id}-hint${fieldState.error ? ` ${id}-error` : ''}`} className="tabular-nums" />
  </HelperField>} />;
}

export function HelperServicesForm({ values, categories, onSave, submitLabel }: { values: HelperServicesInput; categories: CategoryView[]; onSave: ActionHandler<HelperServicesInput>; submitLabel?: string }) {
  const t = useTranslations('helperOnboarding');
  const fieldsCopy = useTranslations('forms');
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const form = useForm<HelperServicesInput>({ resolver: zodResolver(createHelperServicesSchema(categories)), defaultValues: values });
  const rows = useFieldArray({ control: form.control, name: 'services' });
  const services = useWatch({ control: form.control, name: 'services' });
  const action = useHelperFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  const rootError = form.formState.errors.services?.root?.message ?? form.formState.errors.services?.message;
  return <form noValidate onSubmit={(event) => { void form.handleSubmit(async (input) => { await action.run(onSave, input); }, () => { if (!services.length) addButton.current?.focus(); })(event); }} aria-busy={pending} className="space-y-6">
    <fieldset disabled={pending} className="space-y-6">
      <legend className="sr-only">{t('forms.services.title')}</legend>
      {rows.fields.length === 0 && <p className="rounded-lg border border-dashed p-5 text-muted-foreground">{t('forms.services.empty')}</p>}
      {rows.fields.map((row, index) => {
        const service = services[index] ?? row;
        const category = categories.find((item) => item.slug === service.categorySlug);
        const errors = form.formState.errors.services?.[index];
        const categoryId = `${id}-${index}-category`;
        const pricingId = `${id}-${index}-pricing`;
        const hoursId = `${id}-${index}-hours`;
        const descriptionId = `${id}-${index}-description`;
        return <fieldset key={row.id} className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-5">
          <legend className="px-1 font-heading text-base font-semibold">{t('forms.services.service', { number: index + 1 })}</legend>
          <HelperField id={categoryId} label={t('forms.services.category')} hint={t('forms.services.categoryHint')} error={errors?.categorySlug?.message} errorText={errors?.categorySlug?.message === 'invalid' ? t('forms.services.duplicate') : undefined}>
            <select {...form.register(`services.${index}.categorySlug`)} id={categoryId} aria-invalid={!!errors?.categorySlug} aria-describedby={`${categoryId}-hint${errors?.categorySlug ? ` ${categoryId}-error` : ''}`} className={selectClass}>
              {categories.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}
            </select>
          </HelperField>
          {category && <div className="space-y-2">
            {category.requiresBackgroundCheck && <Badge variant="outline">{t('forms.services.background')}</Badge>}
            <p className="text-sm text-muted-foreground">{t('forms.services.categoryMinimum', { amount: formatMoney(category.minPriceCents), hours: category.minHours ?? 0 })}</p>
          </div>}
          <HelperField id={pricingId} label={t('forms.services.pricing')} hint={t('forms.services.pricingHint')} error={errors?.pricingType?.message}>
            <select {...form.register(`services.${index}.pricingType`, { onChange: (event) => {
              if (event.target.value === 'fixed') {
                form.setValue(`services.${index}.hourlyRateCents`, undefined);
                form.setValue(`services.${index}.minHours`, undefined);
              } else form.setValue(`services.${index}.fromPriceCents`, undefined);
              form.clearErrors(`services.${index}`);
            } })} id={pricingId} aria-invalid={!!errors?.pricingType} aria-describedby={`${pricingId}-hint${errors?.pricingType ? ` ${pricingId}-error` : ''}`} className={selectClass}>
              <option value="fixed">{t('forms.services.fixed')}</option><option value="hourly">{t('forms.services.hourly')}</option>
            </select>
          </HelperField>
          {service.pricingType === 'fixed' ? <ServiceMoneyField key="fixed" form={form} name={`services.${index}.fromPriceCents`} label={t('forms.services.fromPrice')} hint={t('forms.services.fromPriceHint', { amount: formatMoney(category?.minPriceCents ?? 0) })} /> : <div className="grid gap-5 sm:grid-cols-2">
            <ServiceMoneyField key="hourly" form={form} name={`services.${index}.hourlyRateCents`} label={t('forms.services.hourlyRate')} hint={t('forms.services.hourlyRateHint')} />
            <HelperField id={hoursId} label={t('forms.services.minHours')} hint={t('forms.services.minHoursHint')} error={errors?.minHours?.message}>
              <Input {...form.register(`services.${index}.minHours`, { setValueAs: (value: string) => value === '' ? undefined : Number(value) })} id={hoursId} type="number" inputMode="numeric" min={1} max={8} step={1} aria-invalid={!!errors?.minHours} aria-describedby={`${hoursId}-hint${errors?.minHours ? ` ${hoursId}-error` : ''}`} className="tabular-nums" />
            </HelperField>
          </div>}
          <HelperField id={descriptionId} label={t('forms.services.description')} hint={t('forms.services.descriptionHint')} error={errors?.description?.message}>
            <Textarea {...form.register(`services.${index}.description`)} id={descriptionId} maxLength={300} rows={3} aria-invalid={!!errors?.description} aria-describedby={`${descriptionId}-hint${errors?.description ? ` ${descriptionId}-error` : ''}`} />
          </HelperField>
          <Button type="button" variant="ghost" onClick={() => rows.remove(index)} className="text-destructive"><Trash2 aria-hidden="true" />{t('forms.services.remove', { number: index + 1 })}</Button>
        </fieldset>;
      })}
      {rootError && <FieldError id={`${id}-services-error`}>{fieldsCopy(`fieldErrors.${rootError}`)}</FieldError>}
      <Button ref={addButton} type="button" variant="outline" aria-describedby={rootError ? `${id}-services-error` : undefined} disabled={!categories.length || rows.fields.length >= categories.length} onClick={() => {
        const category = categories[0];
        if (!category) return;
        rows.append({ categorySlug: category.slug, pricingType: category.defaultPricingType, ...(category.defaultPricingType === 'fixed' ? { fromPriceCents: category.minPriceCents } : { hourlyRateCents: category.minPriceCents, minHours: category.minHours ?? 1 }), description: '' });
      }}><Plus aria-hidden="true" />{t('forms.services.add')}</Button>
    </fieldset>
    <FormFeedback result={action.result} successMessage={t('forms.saved')} />
    <SaveButton pending={pending} label={submitLabel} />
  </form>;
}

export function HelperAreaForm({ values, areas, remoteAllowed, onSave, submitLabel }: { values: HelperAreaInput; areas: HelperOnboardingPageData['areas']; remoteAllowed: boolean; onSave: ActionHandler<HelperAreaInput>; submitLabel?: string }) {
  const t = useTranslations('helperOnboarding');
  const id = useId();
  const form = useForm<HelperAreaInput>({ resolver: zodResolver(helperAreaInputSchema), defaultValues: values });
  const action = useHelperFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  const errors = form.formState.errors;
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(onSave, input); })} aria-busy={pending} className="space-y-6">
    <fieldset disabled={pending} className="space-y-6">
      <legend className="sr-only">{t('forms.area.title')}</legend>
      <HelperField id={`${id}-area`} label={t('forms.area.homeArea')} hint={t('forms.area.homeAreaHint')} error={errors.areaId?.message}>
        <select {...form.register('areaId')} id={`${id}-area`} aria-invalid={!!errors.areaId} aria-describedby={`${id}-area-hint${errors.areaId ? ` ${id}-area-error` : ''}`} className={selectClass}><option value="">{t('forms.area.chooseArea')}</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
      </HelperField>
      <HelperField id={`${id}-radius`} label={t('forms.area.radius')} hint={t('forms.area.radiusHint')} error={errors.serviceRadiusMiles?.message}>
        <select {...form.register('serviceRadiusMiles', { valueAsNumber: true })} id={`${id}-radius`} aria-invalid={!!errors.serviceRadiusMiles} aria-describedby={`${id}-radius-hint${errors.serviceRadiusMiles ? ` ${id}-radius-error` : ''}`} className={selectClass}>{SERVICE_RADIUS_MILES.map((miles) => <option key={miles} value={miles}>{t('forms.area.miles', { miles })}</option>)}</select>
      </HelperField>
      {remoteAllowed && <div className="space-y-1"><label className="flex min-h-11 cursor-pointer items-center gap-3"><input {...form.register('remoteOk')} type="checkbox" aria-describedby={`${id}-remote-hint`} className={checkboxClass} />{t('forms.area.remote')}</label><p id={`${id}-remote-hint`} className="text-sm text-muted-foreground">{t('forms.area.remoteHint')}</p></div>}
    </fieldset>
    <FormFeedback result={action.result} successMessage={t('forms.saved')} />
    <SaveButton pending={pending} label={submitLabel} />
  </form>;
}

export function HelperToolsForm({ values, onSave }: { values: HelperToolsInput; onSave: ActionHandler<HelperToolsInput> }) {
  const t = useTranslations('helperOnboarding');
  const fieldsCopy = useTranslations('forms');
  const id = useId();
  const form = useForm<HelperToolsInput>({ resolver: zodResolver(helperToolsInputSchema), defaultValues: values });
  const action = useHelperFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  const tools = useWatch({ control: form.control, name: 'tools' });
  const toolsError = form.formState.errors.tools?.message;
  return <form noValidate onSubmit={form.handleSubmit(async (input) => { await action.run(onSave, input); })} aria-busy={pending} className="space-y-6">
    <fieldset disabled={pending} className="space-y-5">
      <legend className="sr-only">{t('forms.tools.title')}</legend>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('forms.tools.hint')}</p>
      {!tools.length && <p className="rounded-lg border border-dashed p-5 text-muted-foreground">{t('forms.tools.empty')}</p>}
      {tools.map((_, index) => <div key={index} className="flex items-start gap-2">
        <HelperField id={`${id}-${index}`} label={t('forms.tools.tool', { number: index + 1 })} error={form.formState.errors.tools?.[index]?.message}>
          <Input {...form.register(`tools.${index}`)} id={`${id}-${index}`} maxLength={40} aria-invalid={!!form.formState.errors.tools?.[index]} aria-describedby={`${id}-hint${form.formState.errors.tools?.[index] ? ` ${id}-${index}-error` : ''}`} />
        </HelperField>
        <Button type="button" variant="ghost" className="mt-7" aria-label={t('forms.tools.remove', { number: index + 1 })} onClick={() => { form.setValue('tools', tools.filter((_, toolIndex) => toolIndex !== index), { shouldDirty: true }); form.clearErrors('tools'); }}><Trash2 aria-hidden="true" /></Button>
      </div>)}
      {toolsError && <FieldError>{fieldsCopy(`fieldErrors.${toolsError}`)}</FieldError>}
      <Button type="button" variant="outline" disabled={tools.length >= 20} onClick={() => { form.setValue('tools', [...tools, ''], { shouldDirty: true }); }}><Plus aria-hidden="true" />{t('forms.tools.add')}</Button>
    </fieldset>
    <FormFeedback result={action.result} successMessage={t('forms.saved')} />
    <SaveButton pending={pending} />
  </form>;
}
