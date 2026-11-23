'use client';

import { useId } from 'react';
import { HandCoins, ShieldCheck } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { PAYMENT_MODES, type OfferInput } from '@/contracts';
import { cn } from '@/ui/lib/utils';

const ICONS = { direct: HandCoins, held: ShieldCheck } as const;

/**
 * How the helper is paid (owner, 2026-11-23: no service fees). Directly by the client after the task, the default, with
 * no fee for either of them; or upfront, which TasksNearMe holds and sends when the client says the task is done (the
 * client pays the hold fee, the helper gets the whole price).
 */
export function OfferPaymentMode({ disabled }: { disabled?: boolean }) {
  const t = useTranslations('helperTask.form.payment');
  const id = useId();
  const { register } = useFormContext<OfferInput>();
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className="mb-2 text-sm font-medium">{t('legend')}</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      {PAYMENT_MODES.map((mode) => {
        const Icon = ICONS[mode];
        return <label key={mode} htmlFor={`${id}-${mode}`} className={cn('flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-foreground/[0.1] p-3.5 transition-[background-color,border-color] duration-200 hover:border-foreground/25 has-[:checked]:border-primary/40 has-[:checked]:bg-brand-soft dark:border-white/[0.1]')}>
          {/* Named by its label alone; the hint is its description (the whole card stays the tap target). */}
          <input {...register('paymentMode')} id={`${id}-${mode}`} type="radio" value={mode} aria-labelledby={`${id}-${mode}-label`} aria-describedby={`${id}-${mode}-hint`} className="mt-1 size-4 shrink-0 accent-primary" />
          <span className="min-w-0 space-y-0.5">
            <span id={`${id}-${mode}-label`} className="flex items-center gap-1.5 font-medium"><Icon aria-hidden="true" className="size-4 text-primary" />{t(`${mode}.label`)}</span>
            <span id={`${id}-${mode}-hint`} className="block text-sm text-muted-foreground">{t(`${mode}.hint`)}</span>
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}
