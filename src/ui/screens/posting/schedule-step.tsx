'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { PostTaskPageData, TaskDraftInput } from '@/contracts';
import { marketDayKey } from '@/shared/format';
import { MarketDateInput, MarketTimeSelect } from '@/ui/components/forms/market-schedule-fields';
import { useFormat } from '@/ui/lib/format';
import { PostingField, postingFieldId } from './posting-field';

export function ScheduleStep({ data }: { data: PostTaskPageData }) {
  const t = useTranslations('postTask');
  // The market's zone by name ("Central Time", "hora central"), never a city's (completion plan 8.1).
  const { zoneName } = useFormat();
  const { register, watch, setValue, clearErrors, getFieldState, formState } = useFormContext<TaskDraftInput>();
  const schedule = watch('schedule');
  // Today on the poster's market clock (completion plan 8.1).
  const minimumDate = marketDayKey(data.now, data.market.timeZone);
  const lastDate = new Date(`${minimumDate}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + data.rules.maxLeadDays);
  const maximumDate = lastDate.toISOString().slice(0, 10);
  const dateId = postingFieldId('schedule.date');
  const flexibleId = postingFieldId('schedule.flexible');
  return <div className="space-y-6">
    <p className="rounded-2xl bg-secondary/70 p-4 text-sm text-foreground dark:bg-secondary/40">{t('schedule.policy', { hours: data.rules.minLeadHours, days: data.rules.maxLeadDays, zone: zoneName })}</p>
    <PostingField name="schedule.date" label={t('schedule.date')} hint={t('schedule.dateHint')}>
      <MarketDateInput {...register('schedule.date')} id={dateId} min={minimumDate} max={maximumDate} aria-invalid={getFieldState('schedule.date', formState).invalid} aria-describedby={`${dateId}-hint ${dateId}-error`} className="max-w-sm" />
    </PostingField>
    <PostingField name="schedule.flexible" label={t('schedule.timing')} hint={t('schedule.timingHint')}>
      <div role="radiogroup" aria-label={t('schedule.timing')} aria-describedby={`${flexibleId}-hint`} className="grid gap-3 sm:grid-cols-2">
        {[false, true].map((flexible, index) => <label key={String(flexible)} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-input px-4 transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] hover:border-foreground/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:shadow-[inset_0_0_0_1px_var(--primary)] dark:has-[:checked]:bg-primary/[0.12] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
          <input id={index === 0 ? flexibleId : `${flexibleId}-any`} type="radio" name="schedule.flexible" checked={schedule.flexible === flexible} onChange={() => { if (flexible === schedule.flexible) return; setValue('schedule', flexible ? { date: schedule.date, flexible: true } : { date: schedule.date, flexible: false }, { shouldDirty: true }); clearErrors('schedule'); }} className="size-5 accent-primary" />{t(flexible ? 'schedule.flexible' : 'schedule.window')}
        </label>)}
      </div>
    </PostingField>
    {!schedule.flexible && <div className="grid gap-6 sm:grid-cols-2">{(['startTime', 'endTime'] as const).map((key) => {
      const name = `schedule.${key}` as const;
      const id = postingFieldId(name);
      const error = getFieldState(name, formState).error;
      return <PostingField key={key} name={name} label={t(`schedule.${key}`)} hint={t('schedule.timeHint')} errorText={error?.message === 'out_of_range' ? t(key === 'startTime' ? 'schedule.startTooSoon' : 'schedule.endAfterStart', { hours: data.rules.minLeadHours }) : undefined}>
        <MarketTimeSelect {...register(name)} date={minimumDate} placeholder={t('fields.choose')} id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-error`} />
      </PostingField>;
    })}</div>}
  </div>;
}
