'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Globe, Lock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  CATEGORY_DETAIL_FIELDS,
  type AddressSuggestion,
  type Photo,
  type PostTaskHandlers,
  type PostTaskPageData,
  type PriceBreakdown as PriceBreakdownData,
  type TaskDraftInput,
} from '@/contracts';
import { formatHours, formatMoney, marketLocalToUtc } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export interface ReviewStepProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  values: TaskDraftInput;
  photos: Photo[];
  selectedAddress?: AddressSuggestion;
}

function ReviewLine({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-foreground/[0.06] py-2.5 last:border-b-0 sm:block sm:space-y-1 sm:border-b-0 sm:py-0 dark:border-white/[0.06]">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-right text-base sm:text-left">{children}</dd>
  </div>;
}

/** The three visibility groups mirror the supplied posting contract. Amounts come from onQuote. */
export function ReviewStep({ data, handlers, values, photos, selectedAddress }: ReviewStepProps) {
  const { formatDate, formatTimeRange, timeZone } = useFormat();
  const t = useTranslations('postTask');
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [price, setPrice] = useState<{ key: string; attempt: number; breakdown?: PriceBreakdownData; error?: boolean }>();
  const requestKey = JSON.stringify({ budget: values.budget, expenseAllowanceCents: values.expenseAllowance?.amountCents ?? 0 });
  const onQuote = handlers.onQuote;

  useEffect(() => {
    let active = true;
    const input = JSON.parse(requestKey) as Parameters<PostTaskHandlers['onQuote']>[0];
    void Promise.resolve().then(() => onQuote(input)).then(
      (breakdown) => { if (active) setPrice({ key: requestKey, attempt, breakdown }); },
      () => { if (active) setPrice({ key: requestKey, attempt, error: true }); },
    );
    return () => { active = false; };
  }, [onQuote, requestKey, attempt]);

  const currentPrice = price?.key === requestKey && price.attempt === attempt ? price : undefined;
  const category = data.categories.find((item) => item.slug === values.categorySlug);
  const local = values.location.mode === 'local' ? values.location : undefined;
  const address = local && selectedAddress?.placeId === local.placeId ? selectedAddress : undefined;
  const date = values.schedule.date ? formatDate(marketLocalToUtc(values.schedule.date, '12:00', timeZone)) : t('review.notSet');
  const { startTime, endTime } = values.schedule;
  const time = values.schedule.flexible ? t('review.flexible') : startTime && endTime && values.schedule.date
    ? formatTimeRange(marketLocalToUtc(values.schedule.date, startTime, timeZone), marketLocalToUtc(values.schedule.date, endTime, timeZone))
    : t('review.notSet');
  const visiblePhotos = values.photoIds.map((photoId) => photos.find((photo) => photo.id === photoId));

  return <div className="space-y-6">
    <p className="text-muted-foreground">{t('review.intro')}</p>

    <section aria-labelledby={`${id}-public`} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <h2 id={`${id}-public`} className="flex items-center gap-2 font-heading text-xl font-semibold"><Globe aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('review.everyone')}</h2>
      <p className="break-words font-heading text-lg font-semibold">{values.title}</p>
      <dl className="grid sm:grid-cols-2 sm:gap-4">
        <ReviewLine label={t('review.category')}>{category?.name ?? t('review.notSet')}</ReviewLine>
        <ReviewLine label={t('review.area')}>{local ? address?.areaName ? t('review.areaValue', { area: address.areaName, market: data.market.name }) : t('review.areaUnavailable') : t('review.remote')}</ReviewLine>
        <ReviewLine label={t('review.when')}><span className="block">{date}</span><span className="block tabular-nums">{time}</span></ReviewLine>
        <ReviewLine label={t('review.budget')}>
          {values.budget.type === 'fixed' ? t('review.fixedPrice', { price: formatMoney(values.budget.priceCents) }) : <>
            <span className="block tabular-nums">{t('review.hourlyRate', { rate: formatMoney(values.budget.rateCents) })}</span>
            <span className="block text-sm tabular-nums">{t('review.hourlyHours', { estimate: formatHours(values.budget.estimatedHours), cap: formatHours(values.budget.hoursCap) })}</span>
          </>}
        </ReviewLine>
      </dl>
    </section>

    <section aria-labelledby={`${id}-helpers`} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]">
      <h2 id={`${id}-helpers`} className="flex items-center gap-2 font-heading text-xl font-semibold"><Users aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('review.helpers')}</h2>
      <p className="whitespace-pre-wrap break-words leading-6">{values.description}</p>
      <dl className="grid sm:grid-cols-2 sm:gap-4">
        {CATEGORY_DETAIL_FIELDS[values.categorySlug].map((field) => {
          const value = values.details[field.key];
          if (value === undefined || value === '') return null;
          const display = field.kind === 'choice' && typeof value === 'string' && field.options.includes(value)
            ? t(`details.${values.categorySlug}.${field.key}.options.${value}`)
            : typeof value === 'boolean' ? t(value ? 'review.yes' : 'review.no') : String(value);
          return <ReviewLine key={field.key} label={t(`details.${values.categorySlug}.${field.key}.label`)}>{display}</ReviewLine>;
        })}
        {values.expenseAllowance && <ReviewLine label={t('review.allowance')}><span className="block tabular-nums">{formatMoney(values.expenseAllowance.amountCents)}</span><span className="block">{values.expenseAllowance.description}</span></ReviewLine>}
      </dl>
      {visiblePhotos.length > 0 ? <div className="grid grid-cols-2 gap-3">
        {visiblePhotos.map((photo, index) => photo ? <Image key={values.photoIds[index]} src={photo.src} alt={photo.alt || t('review.photoAlt', { number: index + 1, total: visiblePhotos.length })} width={photo.width ?? 800} height={photo.height ?? 600} className="aspect-[4/3] w-full rounded-2xl border border-foreground/[0.07] object-cover dark:border-white/[0.06]" /> : <p key={values.photoIds[index]} className="flex min-h-24 items-center rounded-2xl border bg-muted p-3 text-sm">{t('review.savedPhoto', { number: index + 1 })}</p>)}
      </div> : <p className="text-sm text-muted-foreground">{t('review.noPhotos')}</p>}
    </section>

    <section aria-labelledby={`${id}-private`} className="space-y-4 rounded-[1.375rem] border border-primary/15 bg-primary/[0.045] p-4 sm:p-6 dark:border-primary/25 dark:bg-primary/[0.08]">
      <h2 id={`${id}-private`} className="flex items-center gap-2 font-heading text-xl font-semibold"><Lock aria-hidden="true" className="size-5 shrink-0 text-primary" />{t('review.bookedHelper')}</h2>
      {local ? <>
        <p className="text-muted-foreground">{t('review.privacy')}</p>
        <dl className="grid sm:gap-4">
          <ReviewLine label={t('review.address')}>
            {address ? <address className="not-italic"><span className="block">{address.line1}</span><span className="block">{address.line2}</span></address> : t('review.addressSaved')}
          </ReviewLine>
          {local.unit && <ReviewLine label={t('review.unit')}>{local.unit}</ReviewLine>}
          {local.accessNotes && <ReviewLine label={t('review.accessNotes')}>{local.accessNotes}</ReviewLine>}
        </dl>
      </> : <p>{t('review.remotePrivacy')}</p>}
    </section>

    <div aria-live="polite" aria-busy={!currentPrice}>
      {currentPrice?.breakdown ? <PriceBreakdown breakdown={currentPrice.breakdown} variant="poster" title={t('review.priceTitle')} /> : currentPrice?.error ? <div role="alert" className="space-y-3 rounded-[1.375rem] border border-destructive/60 bg-destructive/[0.04] p-4">
        <p>{t('review.priceError')}</p><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('review.retryPrice')}</Button>
      </div> : <div className="flex items-center gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-5 shadow-card dark:border-white/[0.06]"><Spinner /><span className="text-muted-foreground">{t('review.priceLoading')}</span></div>}
    </div>
    <p className="text-sm leading-6 text-muted-foreground">{t('review.payment')}</p>
  </div>;
}
