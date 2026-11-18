'use client';

import { useId, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import Form from 'next/form';
import Link from 'next/link';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_SLUGS, routes, type HelperBrowseQuery, type HelpersBrowsePageData } from '@/contracts';
import { ScrollRow } from '@/ui/components/layout/scroll-row';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';

// Pills as on find work: the picked one in the brand tint with an inner ring, the rest quiet until hovered.
const chip = 'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const on = 'border-primary/40 bg-brand-soft text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)] [&>svg:first-child]:text-primary';
const off = 'border-foreground/[0.1] bg-card text-foreground hover:border-foreground/25 hover:bg-background dark:border-white/[0.1]';

/** The form's fields as the URL has them. */
function fieldsOf(query: HelperBrowseQuery) {
  return { q: query.q ?? '', area: query.area ?? '', open: Boolean(query.openTimes) };
}

/**
 * Find helpers' filters as one compact bar (audit M35): the name search, the neighborhood and "open this week" in
 * one form that applies as soon as a choice changes (the Search button and Enter still work without scripts), then
 * the categories as chips. Everything lives in the URL; the app filters.
 */
export function HelpersBrowseFilters({ data }: { data: HelpersBrowsePageData }) {
  const t = useTranslations('helpersBrowse');
  const categories = useTranslations('helperCard.categories');
  const id = useId();
  const { query } = data;
  const href = (change: HelperBrowseQuery) => routes.app.helpers({ ...query, ...change });

  // The fields show the URL's filters, always: fields that kept old values would quietly apply them again with the
  // next search (sweep D10). Two ways they could drift:
  // - this form given another URL's filters: they follow (controlled rather than remounted, so the control in use
  //   keeps its focus while its own change applies);
  // - the router keeps a page alive, hidden, after you leave it (React's Activity, up to 3 routes), and Back or a link
  //   to the same URL (Clear) shows it again as it was left, with the change that took you away still in it. So
  //   leaving puts the fields back to this page's URL.
  const urlKey = JSON.stringify([query.category ?? '', query.q ?? '', query.area ?? '', Boolean(query.openTimes)]);
  const [fields, setFields] = useState(() => fieldsOf(query));
  const [shownKey, setShownKey] = useState(urlKey);
  if (shownKey !== urlKey) {
    setShownKey(urlKey);
    setFields(fieldsOf(query));
  }
  const urlFields = useRef(fieldsOf(query));
  useLayoutEffect(() => { urlFields.current = fieldsOf(query); });
  useLayoutEffect(() => () => setFields(urlFields.current), []);
  // A changed neighborhood or "open this week" applies at once; a typed name waits for Enter or Search.
  const applyNow = (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => event.currentTarget.form?.requestSubmit();

  return <div className="space-y-3">
    <Form action={routes.app.helpers()} role="search" aria-label={t('filtersTitle')} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {query.category && <input type="hidden" name="category" value={query.category} />}
      <div className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input progressive id={`${id}-q`} name="q" type="search" value={fields.q} onChange={(event) => { const q = event.target.value; setFields((current) => ({ ...current, q })); }} aria-label={t('search')} placeholder={t('searchPlaceholder')} className="rounded-full pl-10" />
        </div>
        <Button progressive type="submit" variant="outline" className="shrink-0">{t('apply')}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select name="area" value={fields.area} onChange={(event) => { const area = event.target.value; setFields((current) => ({ ...current, area })); applyNow(event); }} aria-label={t('area')} className={cn(chip, fields.area ? on : off, 'cursor-pointer appearance-none pr-9')}>
            <option value="">{t('anyArea')}</option>
            {data.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <label className={cn(chip, off, 'cursor-pointer has-[:checked]:border-primary/40 has-[:checked]:bg-brand-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring')}>
          <input type="checkbox" name="open" value="1" checked={fields.open} onChange={(event) => { const open = event.target.checked; setFields((current) => ({ ...current, open })); applyNow(event); }} className="size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none" />
          {t('openTimes')}
        </label>
      </div>
    </Form>
    <ScrollRow label={t('category')} currentKey={query.category ?? 'all'} className="gap-2">
      <li><Link href={href({ category: undefined })} aria-current={!query.category ? 'true' : undefined} className={cn(chip, !query.category ? on : off)}>{!query.category && <Check aria-hidden="true" className="size-4" />}{t('anyCategory')}</Link></li>
      {CATEGORY_SLUGS.map((slug) => <li key={slug}><Link href={href({ category: slug })} aria-current={query.category === slug ? 'true' : undefined} className={cn(chip, query.category === slug ? on : off)}>{query.category === slug && <Check aria-hidden="true" className="size-4" />}{categories(slug)}</Link></li>)}
    </ScrollRow>
  </div>;
}
