'use client';

import { useId, useState } from 'react';
import { MoonStar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { quietHoursInputSchema, type AccountHandlers, type ActionResult, type QuietHoursSetting } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Switch } from '@/ui/primitives/switch';

/**
 * Quiet hours of one's own (2026-11-24): off by default; a start and an end on the person's home city's clock. While on,
 * message notifications wait in the app (no push, text or email), except a booking's on its day; everything about
 * bookings, payments and safety still comes. Saved with the button; turning it off saves at once.
 */
export function AccountQuietHours({ setting, onSave }: { setting: QuietHoursSetting; onSave: NonNullable<AccountHandlers['onSaveQuietHours']> }) {
  const t = useTranslations('account.ownQuietHours');
  const id = useId();
  const [enabled, setEnabled] = useState(setting.enabled);
  const [startsAt, setStartsAt] = useState(setting.startsAt);
  const [endsAt, setEndsAt] = useState(setting.endsAt);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function save(next: { enabled: boolean; startsAt: string; endsAt: string }) {
    if (pending) return;
    const parsed = quietHoursInputSchema.safeParse(next);
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setResult(undefined);
    setPending(true);
    try {
      const answer = await onSave(parsed.data);
      if (answer.code === 'validation_failed') setInvalid(true);
      setResult(answer.ok || answer.code !== 'validation_failed' ? answer : undefined);
      if (!answer.ok) setEnabled(setting.enabled);
    } catch {
      setResult({ ok: false, code: 'unknown' });
      setEnabled(setting.enabled);
    } finally {
      setPending(false);
    }
  }

  return <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save({ enabled, startsAt, endsAt }); }}>
    <label htmlFor={`${id}-switch`} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3">
      <span className="flex items-start gap-2.5">
        <MoonStar aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="space-y-0.5">
          <span className="block font-medium">{t('label')}</span>
          <span id={`${id}-state`} className="block text-sm text-muted-foreground">{enabled ? t('onState', { from: startsAt, until: endsAt }) : t('off')}</span>
        </span>
      </span>
      <Switch id={`${id}-switch`} checked={enabled} disabled={pending} aria-describedby={`${id}-state`} onCheckedChange={(next) => {
        setEnabled(next);
        // Turning it off takes effect at once; turning it on waits for the times and Save.
        if (!next) void save({ enabled: false, startsAt, endsAt });
      }} />
    </label>
    {enabled && <fieldset className="space-y-3" disabled={pending}>
      <legend className="sr-only">{t('times')}</legend>
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-from`} className="text-sm font-medium">{t('from')}</label>
          <Input id={`${id}-from`} type="time" step={60} required value={startsAt} aria-invalid={invalid} onChange={(event) => { setStartsAt(event.target.value); setInvalid(false); }} className="min-h-11" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-until`} className="text-sm font-medium">{t('until')}</label>
          <Input id={`${id}-until`} type="time" step={60} required value={endsAt} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={(event) => { setEndsAt(event.target.value); setInvalid(false); }} className="min-h-11" />
        </div>
      </div>
      {invalid && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{t('invalid')}</p>}
      <Button type="submit" className="min-h-11" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? t('pending') : t('save')}</Button>
    </fieldset>}
    <p className="text-sm text-muted-foreground">{t('hint')}</p>
    <p className="text-sm text-muted-foreground">{t('shared')}</p>
    <FormFeedback result={result} successMessage={result?.ok ? t(enabled ? 'saved' : 'turnedOff') : undefined} />
  </form>;
}
