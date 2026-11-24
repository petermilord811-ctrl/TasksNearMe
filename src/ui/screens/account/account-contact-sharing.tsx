'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CONTACT_SHARING_SETTINGS, type AccountHandlers, type AccountPageData, type ContactSharingSetting } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Contact details on your profile" (2026-11-24), for helpers: share nothing (the default), the email, the phone
 * number, or both with neighbors who've earned the top Sparks levels. Saves as soon as it's chosen.
 */
export function AccountContactSharing({ sharing, onSave }: { sharing: NonNullable<AccountPageData['contactSharing']>; onSave: NonNullable<AccountHandlers['onSaveContactSharing']> }) {
  const t = useTranslations('account.contactSharing');
  const id = useId();
  const locale = useLocale();
  const [value, setValue] = useState<ContactSharingSetting>(sharing.setting);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const phoneWaits = !sharing.phoneVerified && (value === 'phone' || value === 'email_phone');

  async function choose(next: ContactSharingSetting) {
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
      {CONTACT_SHARING_SETTINGS.map((option) => <label key={option} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring', value === option && 'border-primary bg-brand-soft/40')}>
        <input type="radio" name={`${id}-setting`} value={option} checked={value === option} onChange={() => void choose(option)} className="mt-1 size-4 accent-[var(--primary)]" />
        <span className="space-y-0.5">
          <span className="block font-medium">{t(`options.${option}.label`)}</span>
          <span className="block text-sm text-muted-foreground">{t(`options.${option}.hint`)}</span>
        </span>
        {pending && value === option && <Spinner aria-hidden="true" className="ml-auto size-4 shrink-0" />}
      </label>)}
    </div>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint', { at: sharing.at.toLocaleString(locale === 'es' ? 'es-US' : 'en-US') })}</p>
    {phoneWaits && <p className="text-sm font-medium">{t('phoneUnverified')}</p>}
    <p role="alert" aria-live="assertive" className="text-sm text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </fieldset>;
}
