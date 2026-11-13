'use client';

import { Minus, Plus } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { CATEGORY_DETAIL_FIELDS, type CategorySlug, type TaskDraftInput } from '@/contracts';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { PostingField, postingFieldId } from './posting-field';

export function DetailsStep({ category }: { category: CategorySlug }) {
  const t = useTranslations('postTask');
  const { control } = useFormContext<TaskDraftInput>();
  return <div className="space-y-6">{CATEGORY_DETAIL_FIELDS[category].map((definition) => {
    const name = `details.${definition.key}` as const;
    const id = postingFieldId(name);
    const label = t(`details.${category}.${definition.key}.label`);
    const hint = t(`details.${category}.${definition.key}.hint`);
    return <Controller key={`${category}-${definition.key}`} name={name} control={control} render={({ field, fieldState }) => {
      const accessibility = { id, 'aria-invalid': fieldState.invalid, 'aria-describedby': `${id}-hint ${id}-error` };
      return <PostingField name={name} label={definition.required ? label : t('fields.optional', { label })} hint={hint}>
        {definition.kind === 'choice' && <select {...accessibility} ref={field.ref} name={field.name} onBlur={field.onBlur} value={typeof field.value === 'string' ? field.value : ''} onChange={field.onChange} className={nativeSelectClassName}>
          <option value="">{t('fields.choose')}</option>
          {definition.options.map((option) => <option key={option} value={option}>{t(`details.${category}.${definition.key}.options.${option}`)}</option>)}
        </select>}
        {definition.kind === 'text' && <Input {...field} {...accessibility} value={typeof field.value === 'string' ? field.value : ''} maxLength={definition.maxLength} />}
        {definition.kind === 'count' && <div className="flex max-w-64 items-center gap-2">
          <Button type="button" size="icon" variant="outline" aria-label={t('fields.decrease', { label })} disabled={typeof field.value === 'number' && field.value <= definition.min} onClick={() => field.onChange(typeof field.value === 'number' ? Math.max(definition.min, field.value - 1) : definition.min)}><Minus aria-hidden="true" className="size-4" /></Button>
          <Input {...accessibility} ref={field.ref} name={field.name} onBlur={field.onBlur} type="number" inputMode="numeric" min={definition.min} max={definition.max} step={1} value={typeof field.value === 'number' ? field.value : ''} onChange={(event) => field.onChange(event.target.value === '' ? '' : event.target.valueAsNumber)} className="text-center tabular-nums" />
          <Button type="button" size="icon" variant="outline" aria-label={t('fields.increase', { label })} disabled={typeof field.value === 'number' && field.value >= definition.max} onClick={() => field.onChange(typeof field.value === 'number' ? Math.min(definition.max, field.value + 1) : definition.min)}><Plus aria-hidden="true" className="size-4" /></Button>
        </div>}
        {definition.kind === 'yes_no' && <div role="radiogroup" aria-label={label} aria-describedby={accessibility['aria-describedby']} aria-invalid={fieldState.invalid} className="grid grid-cols-2 gap-3">
          {[true, false].map((value, index) => <label key={String(value)} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input px-3.5 transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:shadow-[inset_0_0_0_1px_var(--primary)] dark:has-[:checked]:bg-primary/[0.12] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
            <input id={index === 0 ? id : `${id}-no`} ref={index === 0 ? field.ref : undefined} type="radio" name={field.name} value={String(value)} checked={field.value === value} onChange={() => field.onChange(value)} onBlur={field.onBlur} className="size-5 accent-primary" />{t(value ? 'fields.yes' : 'fields.no')}
          </label>)}
        </div>}
      </PostingField>;
    }} />;
  })}</div>;
}
