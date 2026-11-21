'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowRight, BadgeCheck, CheckCircle2, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { WaitlistHandlers, WaitlistInput, WaitlistPageData } from '@/contracts';
import { WAITLIST_INTERESTS, waitlistInputSchema } from '@/contracts/marketing';
import { routes } from '@/contracts/routes';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { formatMoneyShort } from '@/shared/format';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/ui/primitives/field';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { PAGE_TITLE_CLASS } from '@/ui/components/layout/page-header';

export interface WaitlistScreenProps {
  data: WaitlistPageData;
  handlers: WaitlistHandlers;
  /**
   * Part of another page (the home page while its city isn't open): its own heading, a level down (h2), and its own
   * words, without the list of open cities (that page lists every city with its status).
   */
  embedded?: { title: string; description: string };
}

export function WaitlistConfirmation({ email, zip }: Pick<WaitlistInput, 'email' | 'zip'>) {
  const t = useTranslations('waitlist');
  return <div className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
    <CheckCircle2 aria-hidden="true" className="size-8 text-success" />
    <h2 className="font-display text-xl font-semibold leading-7 tracking-[-0.015em] lg:text-[22px] lg:leading-[30px]">{t('joinedTitle')}</h2>
    <p className="break-words text-muted-foreground">{t('joinedDescription', { email, zip })}</p>
  </div>;
}

const card = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]';

/**
 * `/waitlist` (owner, 2026-11-14: national, cities open in turn). We open city by city: people elsewhere leave
 * their email, ZIP and city, see how many already wait near them and which cities come next by demand, and
 * helpers learn they can get verified now, wherever they live.
 */
export function WaitlistScreen({ data, handlers, embedded }: WaitlistScreenProps) {
  const t = useTranslations('waitlist');
  const forms = useTranslations('forms');
  const id = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);
  const [joined, setJoined] = useState<WaitlistInput>();
  const form = useForm<WaitlistInput>({
    resolver: zodResolver(waitlistInputSchema),
    defaultValues: { email: '', zip: data.initialZip ?? '', city: '' },
  });
  const action = useFormAction(form);
  const pending = action.pending || form.formState.isSubmitting;
  const nearby = data.demand ? data.demand.waiting + data.demand.helpersWaiting : 0;

  useEffect(() => {
    if (joined) confirmationRef.current?.focus();
  }, [joined]);

  const Heading = embedded ? 'h2' : 'h1';
  return <section aria-labelledby={`${id}-title`} className={embedded ? 'space-y-6' : 'mx-auto max-w-reading space-y-6 py-4 sm:py-8'}>
    <header className="space-y-3">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><MapPin className="size-6" /></span>
      <Heading id={`${id}-title`} className={PAGE_TITLE_CLASS}>{embedded ? embedded.title : t(data.from === 'beta' ? 'beta.title' : 'title')}</Heading>
      <p className="text-muted-foreground">{embedded ? embedded.description : t(data.from === 'beta' ? 'beta.description' : 'description')}</p>
      {data.demand && nearby > 0 && <p className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"><Users aria-hidden="true" className="size-4 text-primary" />{t('demand', { count: nearby, zip: data.demand.zip })}</p>}
    </header>

    <div aria-live="polite" aria-atomic="true" ref={confirmationRef} tabIndex={joined ? -1 : undefined} className={joined ? undefined : 'sr-only'}>
      {joined && <WaitlistConfirmation email={joined.email} zip={joined.zip} />}
    </div>

    {!joined && <form noValidate aria-busy={pending} className={`space-y-6 ${card}`} onSubmit={form.handleSubmit(async (values) => {
      const result = await action.run(handlers.onJoin, values);
      if (result?.ok && result.code === 'submitted') setJoined(values);
    })}>
      <FieldGroup>
        <TextFormField control={form.control} name="email" label={forms('fields.email.label')} hint={forms('fields.email.hint')} type="email" autoComplete="email" required disabled={pending} />
        {/* Room for the ZIP's hint on two lines; at 10rem it took three, "help." alone on the last (f7's visual pass). */}
        <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <TextFormField control={form.control} name="zip" label={forms('fields.zip.label')} hint={forms('fields.zip.hint')} autoComplete="postal-code" inputMode="numeric" maxLength={5} required disabled={pending} />
          <TextFormField control={form.control} name="city" label={t('city')} hint={t('cityHint')} autoComplete="address-level2" maxLength={60} disabled={pending} />
        </div>
        <Controller control={form.control} name="interest" render={({ field, fieldState }) => <FieldSet data-invalid={fieldState.invalid} className="gap-3">
          <FieldLegend id={`${id}-interest-label`} className="mb-0">{forms('fields.interest.label')}</FieldLegend>
          <FieldDescription id={`${id}-interest-hint`} className="mt-1">{forms('fields.interest.hint')}</FieldDescription>
          <RadioGroup
            name={field.name}
            value={field.value ?? ''}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            disabled={pending}
            required
            aria-labelledby={`${id}-interest-label`}
            aria-describedby={`${id}-interest-hint${fieldState.error ? ` ${id}-interest-error` : ''}`}
            aria-invalid={fieldState.invalid}
            className="gap-2"
          >
            {WAITLIST_INTERESTS.map((interest, index) => <Field key={interest} orientation="horizontal" className="gap-3 rounded-2xl border border-border px-3 transition-[background-color,border-color] duration-200 hover:border-foreground/25 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-brand-soft">
              <RadioGroupItem id={`${id}-${interest}`} value={interest} ref={index === 0 ? field.ref : undefined} />
              <FieldLabel htmlFor={`${id}-${interest}`} className="min-h-11 flex-1 py-3 text-base font-normal">{t(`interests.${interest}`)}</FieldLabel>
            </Field>)}
          </RadioGroup>
          {fieldState.error && <FieldError id={`${id}-interest-error`} role="status" aria-live="polite">{forms(`fieldErrors.${fieldState.error.message ?? 'required'}`)}</FieldError>}
        </FieldSet>} />
      </FieldGroup>
      <FormFeedback result={action.result} />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        {pending && <Spinner aria-hidden="true" />}
        {t('join')}
      </Button>
    </form>}

    {data.helperReward && <section aria-labelledby={`${id}-helpers`} className={`space-y-3 ${card}`}>
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-badge-reward text-badge-reward-foreground"><BadgeCheck className="size-5" /></span>
      <h2 id={`${id}-helpers`} className="text-[17px] font-semibold leading-6 lg:text-lg">{t('helpers.title')}</h2>
      {/* Marketing copy: "$50", as the become-a-helper page says it, not a receipt's "$50.00" (f7's visual pass, 2026-11-18). */}
      <p className="text-muted-foreground">{t.rich('helpers.body', { amount: () => formatMoneyShort(data.helperReward!.amountCents) })}</p>
      <Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'outline', className: 'w-full sm:w-auto' })}>{t('helpers.cta')}<ArrowRight aria-hidden="true" /></Link>
    </section>}

    {data.comingNext.length > 0 && <section aria-labelledby={`${id}-next`} className={`space-y-3 ${card}`}>
      <div className="space-y-1">
        <h2 id={`${id}-next`} className="text-[17px] font-semibold leading-6 lg:text-lg">{t('comingNext.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('comingNext.description')}</p>
      </div>
      <ol className="divide-y divide-foreground/[0.07] dark:divide-white/[0.07]">
        {data.comingNext.map((city, index) => <li key={`${city.city}-${city.state}`} className="flex min-h-12 items-center gap-3 py-2">
          <span aria-hidden="true" className="w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
          <span className="min-w-0 flex-1 font-medium">{t('comingNext.city', { city: city.city, state: city.state })}</span>
          <span className="shrink-0 text-right text-sm text-muted-foreground">{t('comingNext.people', { count: city.people })}{city.helpersWaiting > 0 && <span className="block text-xs">{t('comingNext.helpers', { count: city.helpersWaiting })}</span>}</span>
        </li>)}
      </ol>
    </section>}

    {!embedded && data.markets.length > 0 && <section aria-labelledby={`${id}-markets`} className="space-y-2 rounded-[1.375rem] border border-callout-border bg-callout p-4 text-callout-foreground sm:p-6">
      <h2 id={`${id}-markets`} className="text-[17px] font-semibold leading-6 lg:text-lg">{t('marketsTitle')}</h2>
      <ul>
        {data.markets.map((market) => <li key={market.slug}><Link href={routes.market(market.slug)} className="inline-flex min-h-11 items-center py-2 underline underline-offset-4">{t('marketLink', { market: market.name })}</Link></li>)}
      </ul>
    </section>}
  </section>;
}
