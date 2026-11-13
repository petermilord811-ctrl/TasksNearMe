'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { APP_LOCALES, LOCALE_NAMES, type AccountHandlers, type AppLocale } from '@/contracts';
import { splitLocalePath } from '@/shared/locale';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * The account's language (blueprint 01, P2): the app, emails and texts. Choosing one saves it for the
 * account and this device, then loads the page again in it. Each language is named in itself.
 */
export function AccountLanguage({ language, onSave }: { language: AppLocale; onSave: NonNullable<AccountHandlers['onSaveLanguage']> }) {
  const t = useTranslations('account.language');
  const id = useId();
  const [pending, setPending] = useState<AppLocale | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(locale: AppLocale) {
    if (pending || locale === language) return;
    setPending(locale);
    setFailed(false);
    try {
      const result = await onSave({ locale });
      if (result.ok) {
        // The whole app changes language: load this page again, without a language in its address.
        const { pathname, search, hash } = window.location;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- another language is another root layout: a full load, on purpose
        window.location.assign(`${splitLocalePath(pathname)?.path ?? pathname}${search}${hash}`);
        return;
      }
    } catch {
      // Shown below.
    }
    setFailed(true);
    setPending(null);
  }

  return <div className="space-y-3">
    <fieldset aria-describedby={`${id}-hint`} disabled={pending !== null} className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">{t('title')}</legend>
      {APP_LOCALES.map((locale) => <label key={locale} className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-base transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
        pending !== null && 'cursor-default opacity-80',
      )}>
        <input type="radio" name={`${id}-language`} value={locale} checked={locale === (pending ?? language)} onChange={() => void choose(locale)} className="size-4 shrink-0 accent-primary focus-visible:outline-none" />
        <span lang={locale} className="flex-1 font-medium">{LOCALE_NAMES[locale]}</span>
        {pending === locale && <Spinner aria-hidden="true" className="size-4" />}
      </label>)}
    </fieldset>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
    <p role="alert" aria-live="assertive" className="text-sm text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </div>;
}
