'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, OfferView, TaskOwnerHandlers } from '@/contracts';
import { OfferCard } from '@/ui/components/offers/offer-card';
import { OfferComparison } from '@/ui/components/offers/offer-comparison';
import { nativeSelectClassName } from '@/ui/components/forms/native-select';
import { Button } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

export function TaskOffers({ offers, now, onAction, initialSelectedOfferIds = [] }: {
  offers: OfferView[];
  now: ISODateTime;
  onAction: TaskOwnerHandlers['onOfferAction'];
  initialSelectedOfferIds?: string[];
}) {
  const t = useTranslations('taskManage');
  const id = useId();
  const [sort, setSort] = useState('given');
  const [selectedIds, setSelectedIds] = useState(initialSelectedOfferIds.slice(0, 3));
  const [limitReached, setLimitReached] = useState(false);
  const selected = offers.filter((offer) => selectedIds.includes(offer.id));
  const sorted = sort === 'given' ? offers : [...offers].sort((a, b) => sort === 'newest'
    ? b.submittedAt.localeCompare(a.submittedAt)
    : a.breakdown.taskPriceCents - b.breakdown.taskPriceCents);

  function toggle(offerId: string) {
    if (selectedIds.includes(offerId)) {
      setSelectedIds(selectedIds.filter((value) => value !== offerId));
      setLimitReached(false);
    } else if (selected.length < 3) {
      setSelectedIds([...selected.map((offer) => offer.id), offerId]);
      setLimitReached(false);
    } else setLimitReached(true);
  }

  return <div className="space-y-6">
    <div id="compare" className="scroll-mt-[calc(var(--app-header-offset,0px)+1.5rem)] space-y-3 rounded-[1.375rem] border border-primary/15 bg-primary/[0.045] p-4 sm:p-5 dark:border-primary/25 dark:bg-primary/[0.08]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1"><h3 className="font-heading text-lg font-semibold">{t('compareTitle')}</h3><p className="text-sm text-muted-foreground">{t('compareHint')}</p></div>
        {selected.length > 0 && <Button type="button" variant="outline" onClick={() => { setSelectedIds([]); setLimitReached(false); }}>{t('clearSelection')}</Button>}
      </div>
      <p aria-live="polite" aria-atomic="true" className="inline-flex rounded-full bg-card px-3 py-1 text-sm font-medium tabular-nums shadow-[0_1px_2px_rgb(23_18_14/0.06)] dark:bg-white/[0.06]">{limitReached ? t('compareLimit') : t('compareCount', { count: selected.length })}</p>
    </div>
    {selected.length >= 2 && <OfferComparison offers={selected} now={now} />}
    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
      <label htmlFor={`${id}-sort`} className="text-sm font-medium">{t('sort')}</label>
      <select id={`${id}-sort`} value={sort} onChange={(event) => setSort(event.target.value)} className={cn(nativeSelectClassName, 'w-auto max-w-full')}>
        {(['given', 'newest', 'lowest'] as const).map((value) => <option key={value} value={value}>{t(`sortOptions.${value}`)}</option>)}
      </select>
    </div>
    <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
      {sorted.map((offer) => <li key={offer.id} className="min-w-0"><OfferCard offer={offer} now={now} onAction={onAction} selectable={{ selected: selectedIds.includes(offer.id), onToggle: () => toggle(offer.id) }} /></li>)}
    </ul>
  </div>;
}
