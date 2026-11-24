'use client';

import { useId, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { readPointerPreference, savePointerPreference, subscribePointerPreference } from '@/ui/components/cursor/pointer-preference';
import { cn } from '@/ui/lib/utils';

/**
 * "Use the system pointer" (2026-11-24): on this device, keep the computer's own pointer instead of TasksNearMe's
 * Bubble cursor (for example a larger one someone relies on). Applies at once; shown only on devices with a mouse.
 */
export function AccountPointer() {
  const t = useTranslations('account.pointer');
  const id = useId();
  const system = useSyncExternalStore(subscribePointerPreference, () => readPointerPreference() === 'system', () => false);

  return <div className="space-y-3">
    <label htmlFor={`${id}-switch`} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
      <span className="font-medium">{t('system')}</span>
      <span className="flex items-center gap-2">
        <input id={`${id}-switch`} type="checkbox" role="switch" checked={system} aria-describedby={`${id}-hint`} onChange={(event) => savePointerPreference(event.target.checked ? 'system' : 'bubble')} className="peer sr-only" />
        <span aria-hidden="true" className={cn('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200', system ? 'bg-primary' : 'bg-foreground/20')}>
          <span className={cn('absolute top-0.5 size-6 rounded-full bg-background shadow transition-transform duration-200 motion-reduce:transition-none', system ? 'translate-x-[1.375rem]' : 'translate-x-0.5')} />
        </span>
      </span>
    </label>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
  </div>;
}
