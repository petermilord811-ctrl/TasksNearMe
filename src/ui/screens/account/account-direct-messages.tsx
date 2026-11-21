'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DIRECT_MESSAGE_SETTINGS, type AccountHandlers, type DirectMessageSetting } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Who can message me directly" (2026-11-21): everyone, people you've talked to about a task, or nobody. Saves as
 * soon as it's chosen. Conversations already going on carry on either way; blocking someone stops theirs.
 */
export function AccountDirectMessages({ setting, onSave }: { setting: DirectMessageSetting; onSave: NonNullable<AccountHandlers['onSaveDirectMessages']> }) {
  const t = useTranslations('account.directMessages');
  const id = useId();
  const [value, setValue] = useState(setting);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(next: DirectMessageSetting) {
    if (pending || next === value) return;
    const before = value;
    setValue(next);
    setPending(true);
    setFailed(false);
    try {
      const result = await onSave({ setting: next });
      if (!result.ok) throw new Error(result.code);
    } catch {
      setValue(before);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <fieldset className="space-y-3" aria-describedby={`${id}-hint`} disabled={pending}>
    <legend className="sr-only">{t('legend')}</legend>
    <div className="space-y-2">
      {DIRECT_MESSAGE_SETTINGS.map((option) => <label key={option} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring', value === option && 'border-primary bg-brand-soft/40')}>
        <input type="radio" name={`${id}-setting`} value={option} checked={value === option} onChange={() => void choose(option)} className="mt-1 size-4 accent-[var(--primary)]" />
        <span className="space-y-0.5">
          <span className="block font-medium">{t(`options.${option}.label`)}</span>
          <span className="block text-sm text-muted-foreground">{t(`options.${option}.hint`)}</span>
        </span>
        {pending && value === option && <Spinner aria-hidden="true" className="ml-auto size-4 shrink-0" />}
      </label>)}
    </div>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
    <p role="alert" aria-live="assertive" className="text-sm text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </fieldset>;
}
