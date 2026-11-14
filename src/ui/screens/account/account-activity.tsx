'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AccountHandlers } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Show when I'm active" (completion plan 7.1). On: the people you talk to see "Active now" or "Active today" and
 * "Seen". Off: nobody does, and you don't see theirs (it's mutual). Saves as soon as it's switched.
 */
export function AccountActivity({ shown, onSave }: { shown: boolean; onSave: NonNullable<AccountHandlers['onSaveActivity']> }) {
  const t = useTranslations('account.activity');
  const id = useId();
  const [value, setValue] = useState(shown);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(next: boolean) {
    if (pending) return;
    setValue(next);
    setPending(true);
    setFailed(false);
    try {
      const result = await onSave({ shown: next });
      if (!result.ok) throw new Error(result.code);
    } catch {
      setValue(!next);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-3">
    <label htmlFor={`${id}-switch`} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
      <span className="space-y-0.5">
        <span className="block font-medium">{t('label')}</span>
        <span id={`${id}-state`} className="block text-sm text-muted-foreground">{t(value ? 'on' : 'off')}</span>
      </span>
      <span className="flex items-center gap-2">
        {pending && <Spinner aria-hidden="true" className="size-4" />}
        <input id={`${id}-switch`} type="checkbox" role="switch" checked={value} disabled={pending} aria-describedby={`${id}-state ${id}-hint`} onChange={(event) => void toggle(event.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className={cn('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200', value ? 'bg-primary' : 'bg-foreground/20')}>
          <span className={cn('absolute top-0.5 size-6 rounded-full bg-background shadow transition-transform duration-200 motion-reduce:transition-none', value ? 'translate-x-[1.375rem]' : 'translate-x-0.5')} />
        </span>
      </span>
    </label>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
    <p role="alert" aria-live="assertive" className="text-sm text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </div>;
}
