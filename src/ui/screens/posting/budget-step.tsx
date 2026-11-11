'use client';

import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { PostTaskPageData, TaskDraftInput } from '@/contracts';
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/shared/format';
import { Input } from '@/ui/primitives/input';
import { PostingField, postingFieldId } from './posting-field';

type MoneyName = 'budget.priceCents' | 'budget.rateCents' | 'expenseAllowance.amountCents';

function MoneyField({ name, label, hint }: { name: MoneyName; label: string; hint: string }) {
  const { control, setError, clearErrors } = useFormContext<TaskDraftInput>();
  const [editing, setEditing] = useState<{ cents: number; raw: string }>();
  const id = postingFieldId(name);
  return <Controller name={name} control={control} render={({ field, fieldState }) => <PostingField name={name} label={label} hint={hint}>
    <Input id={id} ref={field.ref} name={field.name} inputMode="decimal" aria-invalid={fieldState.invalid} aria-describedby={`${id}-hint ${id}-error`} value={editing && Object.is(editing.cents, field.value) ? editing.raw : typeof field.value === 'number' && Number.isInteger(field.value) && field.value > 0 ? formatMoneyInput(field.value) : ''} onBlur={field.onBlur} onChange={(event) => {
      const raw = event.target.value;
      const cents = parseMoneyInput(raw);
      setEditing({ cents: cents ?? -1, raw });
      field.onChange(cents ?? -1);
      if (cents === null) setError(name, { type: 'money-input', message: raw.trim() === '' ? 'required' : 'invalid' });
      else clearErrors(name);
    }} className="max-w-sm tabular-nums" />
  </PostingField>} />;
}

export function BudgetStep({ data }: { data: PostTaskPageData }) {
  const t = useTranslations('postTask');
  const { watch, setValue, clearErrors, register, getFieldState, formState } = useFormContext<TaskDraftInput>();
  const budget = watch('budget');
  const expense = watch('expenseAllowance');
  const category = data.categories.find((item) => item.slug === watch('categorySlug'));
  const typeId = postingFieldId('budget.type');
  if (!category) return null;
  return <div className="space-y-6">
    <p className="rounded-lg bg-secondary p-4 text-secondary-foreground">{t('budget.guidance', { market: data.market.name, low: formatMoney(category.priceGuidance.lowCents), high: formatMoney(category.priceGuidance.highCents), unit: t(`budget.units.${category.priceGuidance.unit}`) })}</p>
    <PostingField name="budget.type" label={t('budget.type')} hint={t('budget.typeHint')}>
      <div role="radiogroup" aria-label={t('budget.type')} aria-describedby={`${typeId}-hint`} className="grid grid-cols-2 gap-3">
        {(['fixed', 'hourly'] as const).map((type, index) => <label key={type} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
          <input id={index === 0 ? typeId : `${typeId}-hourly`} name="budget.type" type="radio" checked={budget.type === type} onChange={() => { if (budget.type === type) return; setValue('budget', type === 'fixed' ? { type: 'fixed', priceCents: 0 } : { type: 'hourly', rateCents: 0, estimatedHours: category.minHours ?? 1, hoursCap: category.minHours ?? 1 }, { shouldDirty: true }); clearErrors('budget'); }} className="size-5 accent-primary" />{t(`budget.${type}`)}
        </label>)}
      </div>
    </PostingField>
    {budget.type === 'fixed'
      ? <MoneyField key="fixed" name="budget.priceCents" label={t('budget.price')} hint={t('budget.priceHint', { minimum: formatMoney(category.minPriceCents) })} />
      : <div className="space-y-6">
        <MoneyField key="hourly" name="budget.rateCents" label={t('budget.rate')} hint={t('budget.rateHint')} />
        {category.minHours !== undefined && <p className="text-sm text-muted-foreground">{t('budget.minimumHours', { hours: category.minHours })}</p>}
        <div className="grid gap-6 sm:grid-cols-2">{(['estimatedHours', 'hoursCap'] as const).map((key) => {
          const name = `budget.${key}` as const;
          const id = postingFieldId(name);
          return <PostingField key={key} name={name} label={t(`budget.${key}`)} hint={t(`budget.${key}Hint`)}>
            <Input {...register(name, { setValueAs: (value: string) => value === '' || !Number.isFinite(Number(value)) ? -1 : Number(value) })} id={id} type="number" inputMode="decimal" min={0.5} step={0.5} value={Number.isFinite(budget[key]) && budget[key] >= 0 ? budget[key] : ''} aria-invalid={getFieldState(name, formState).invalid} aria-describedby={`${id}-hint ${id}-error`} className="tabular-nums" />
          </PostingField>;
        })}</div>
      </div>}
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium"><input type="checkbox" checked={expense !== undefined} onChange={(event) => { setValue('expenseAllowance', event.target.checked ? { amountCents: 0, description: '' } : undefined, { shouldDirty: true }); clearErrors('expenseAllowance'); }} className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />{t('budget.addExpense')}</label>
      <p className="text-sm text-muted-foreground">{t('budget.expenseHint')}</p>
      {expense !== undefined && <>
        <MoneyField name="expenseAllowance.amountCents" label={t('budget.expenseAmount')} hint={t('budget.expenseAmountHint', { maximum: formatMoney(data.rules.maxExpenseAllowanceCents) })} />
        <PostingField name="expenseAllowance.description" label={t('budget.expenseDescription')} hint={t('budget.expenseDescriptionHint')}>
          <Input {...register('expenseAllowance.description')} id={postingFieldId('expenseAllowance.description')} maxLength={120} aria-invalid={getFieldState('expenseAllowance.description', formState).invalid} aria-describedby={`${postingFieldId('expenseAllowance.description')}-hint ${postingFieldId('expenseAllowance.description')}-error`} />
        </PostingField>
      </>}
    </div>
  </div>;
}
