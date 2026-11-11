'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { PostTaskPageData, TaskDraftInput } from '@/contracts';
import { formatTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { Input } from '@/ui/primitives/input';
import { PostingField, postingFieldId } from './posting-field';

export function ScheduleStep({ data }: { data: PostTaskPageData }) {
  const t = useTranslations('postTask');
  const { register, watch, setValue, clearErrors, getFieldState, formState } = useFormContext<TaskDraftInput>();
  const schedule = watch('schedule');
  const minimumDate = marketDayKey(data.now);
  const lastDate = new Date(`${minimumDate}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + data.rules.maxLeadDays);
  const maximumDate = lastDate.toISOString().slice(0, 10);
  const dateId = postingFieldId('schedule.date');
  const flexibleId = postingFieldId('schedule.flexible');
  const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`);
  return <div className="space-y-6">
    <p className="rounded-lg bg-secondary p-4 text-sm text-secondary-foreground">{t('schedule.policy', { hours: data.rules.minLeadHours, days: data.rules.maxLeadDays, market: data.market.name })}</p>
    <PostingField name="schedule.date" label={t('schedule.date')} hint={t('schedule.dateHint')}>
      <Input {...register('schedule.date')} id={dateId} type="date" min={minimumDate} max={maximumDate} aria-invalid={getFieldState('schedule.date', formState).invalid} aria-describedby={`${dateId}-hint ${dateId}-error`} className="max-w-sm" />
    </PostingField>
    <PostingField name="schedule.flexible" label={t('schedule.timing')} hint={t('schedule.timingHint')}>
      <div role="radiogroup" aria-label={t('schedule.timing')} aria-describedby={`${flexibleId}-hint`} className="grid gap-3 sm:grid-cols-2">
        {[false, true].map((flexible, index) => <label key={String(flexible)} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
          <input id={index === 0 ? flexibleId : `${flexibleId}-any`} type="radio" name="schedule.flexible" checked={schedule.flexible === flexible} onChange={() => { if (flexible === schedule.flexible) return; setValue('schedule', flexible ? { date: schedule.date, flexible: true } : { date: schedule.date, flexible: false }, { shouldDirty: true }); clearErrors('schedule'); }} className="size-5 accent-primary" />{t(flexible ? 'schedule.flexible' : 'schedule.window')}
        </label>)}
      </div>
    </PostingField>
    {!schedule.flexible && <div className="grid gap-6 sm:grid-cols-2">{(['startTime', 'endTime'] as const).map((key) => {
      const name = `schedule.${key}` as const;
      const id = postingFieldId(name);
      const error = getFieldState(name, formState).error;
      return <PostingField key={key} name={name} label={t(`schedule.${key}`)} hint={t('schedule.timeHint')} errorText={error?.message === 'out_of_range' ? t(key === 'startTime' ? 'schedule.startTooSoon' : 'schedule.endAfterStart', { hours: data.rules.minLeadHours }) : undefined}>
        <select {...register(name)} id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-error`} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <option value="">{t('fields.choose')}</option>
          {timeOptions.map((time) => <option key={time} value={time}>{formatTime(marketLocalToUtc(minimumDate, time))}</option>)}
        </select>
      </PostingField>;
    })}</div>}
  </div>;
}
