'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult } from '@/contracts/actions';
import { routes } from '@/contracts/routes';
import { SAVED_SEARCH_ALERTS, SAVED_SEARCH_MAX, type NewSavedSearchHandlers, type NewSavedSearchPageData, type SavedSearchAlert } from '@/contracts/searches';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { SavedSearchFilterChips, useFilterLabels } from '@/ui/components/search/saved-search-filters';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { useRouteDialog } from '@/ui/lib/route-dialog';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

interface NewSavedSearchProps { data: NewSavedSearchPageData; handlers: NewSavedSearchHandlers }

/** Saving a board or find work view (completion plan 7.10): its filters, a name (suggested from them), and the alerts. */
export function NewSavedSearchScreen({ data, handlers }: NewSavedSearchProps) {
  const t = useTranslations('savedSearches');
  return <div className="mx-auto w-full max-w-reading space-y-5">
    <Link href={data.from} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t(data.source === 'find_work' ? 'new.backFindWork' : 'new.back')}</Link>
    <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em]">{t('new.title')}</h1>
    <NewSavedSearchForm data={data} handlers={handlers} />
  </div>;
}

/**
 * The same as a dialog over the board, find work or the map it was saved from (src/app/[locale]/@modal): once it's
 * saved the dialog closes and the person carries on browsing where they were.
 */
export function NewSavedSearchDialog({ data, handlers }: NewSavedSearchProps) {
  const t = useTranslations('savedSearches');
  return <>
    <RouteDialogHeader title={t('new.title')} description={t('new.intro')} />
    <RouteDialogBody><NewSavedSearchForm data={data} handlers={handlers} /></RouteDialogBody>
  </>;
}

function NewSavedSearchForm({ data, handlers }: NewSavedSearchProps) {
  const t = useTranslations('savedSearches');
  const router = useRouter();
  const dialog = useRouteDialog();
  const locale = useLocale();
  const id = useId();
  const labels = useFilterLabels()(data.filters);
  const [name, setName] = useState((labels.length > 0 ? labels.slice(0, 3).join(' · ') : t('everything', { market: data.marketName })).slice(0, 60));
  const [alert, setAlert] = useState<SavedSearchAlert>('instant');
  const [result, setResult] = useState<ActionResult | undefined>();
  const [pending, startTransition] = useTransition();
  const submit = () => startTransition(async () => {
    let next: ActionResult;
    try {
      next = await handlers.onSave({ from: data.from, name, alert });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next);
    if (next.ok) {
      if (dialog) dialog.finish(next, t('updated'));
      else {
        toast.success(t('updated'));
        router.push(localeHref(next.redirectTo ?? routes.app.savedSearches(), locale));
      }
    }
  });
  return <>
    {data.full
      ? <p role="status" className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">{t('new.full', { max: SAVED_SEARCH_MAX })} <Link href={routes.app.savedSearches()} className="font-semibold text-primary underline underline-offset-4">{t('new.manage')}</Link></p>
      : <form noValidate aria-label={t('new.title')} className="space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-6 dark:border-white/[0.06]" onSubmit={(event) => { event.preventDefault(); if (!pending) submit(); }}>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t('new.filters')}</p>
            <SavedSearchFilterChips filters={data.filters} everything={t('everything', { market: data.marketName })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-semibold">{t('new.name')}</label>
            <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} aria-describedby={`${id}-name-hint`} aria-invalid={Boolean(result && !result.ok && result.fieldErrors?.name)} />
            <p id={`${id}-name-hint`} className="text-sm text-muted-foreground">{t('new.nameHint')}</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('alerts.label')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SAVED_SEARCH_ALERTS.map((option) => <label key={option} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-3.5 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-ring', alert === option ? 'border-primary/60 bg-primary/[0.05]' : 'border-foreground/[0.09] hover:border-foreground/20')}>
                <input type="radio" name="alert" value={option} checked={alert === option} onChange={() => setAlert(option)} className="accent-[var(--primary)]" />{t(`alerts.${option}`)}
              </label>)}
            </div>
            <p className="text-sm text-muted-foreground">{t('alerts.hint')}</p>
          </fieldset>
          {result && !result.ok && <FormFeedback result={result} />}
          <Button type="submit" disabled={pending || name.trim().length < 2} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'new.submitting' : 'new.submit')}</Button>
        </form>}
  </>;
}
