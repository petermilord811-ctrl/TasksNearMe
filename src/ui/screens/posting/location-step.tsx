'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { LoaderCircle, Lock, MapPin } from 'lucide-react';
import type { AddressSuggestion, PostTaskHandlers, PostTaskPageData, TaskDraftInput } from '@/contracts';
import { TextFormField } from '@/ui/components/forms/text-form-field';
import { GeneralAreaMap } from '@/ui/components/map/general-area-map';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Textarea } from '@/ui/primitives/textarea';
import { cn } from '@/ui/lib/utils';

export interface LocationStepProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  selectedAddress?: AddressSuggestion;
  onAddressChange: (address: AddressSuggestion | undefined) => void;
  initialSuggestions?: AddressSuggestion[];
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
}

export function LocationStep({ data, handlers, selectedAddress, onAddressChange, initialSuggestions, liveMap = true }: LocationStepProps) {
  const t = useTranslations('postTask');
  const errors = useTranslations('forms');
  const id = useId();
  const { control, register, setValue, getFieldState, formState } = useFormContext<TaskDraftInput>();
  const location = useWatch({ control, name: 'location' });
  const categorySlug = useWatch({ control, name: 'categorySlug' });
  const category = data.categories.find((item) => item.slug === categorySlug);
  const [query, setQuery] = useState(selectedAddress?.line1 ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>(initialSuggestions ?? []);
  const [open, setOpen] = useState(!!initialSuggestions?.length);
  const [active, setActive] = useState(-1);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const request = useRef(0);
  const modeError = getFieldState('location.mode', formState).error?.message;
  const placeError = getFieldState('location.placeId', formState).error?.message;
  const notesError = getFieldState('location.accessNotes', formState).error?.message;

  useEffect(() => {
    if (!searchEnabled || query.trim().length < 3 || location.mode !== 'local') return;
    const current = ++request.current;
    let canceled = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const results = await handlers.onSearchAddresses({ query: query.trim() });
        if (canceled || current !== request.current) return;
        setSuggestions(results);
        setActive(-1);
        setOpen(true);
        setStatus('loaded');
      } catch {
        if (canceled || current !== request.current) return;
        setStatus('error');
        setSuggestions([]);
      }
    }, 300);
    return () => { clearTimeout(timer); canceled = true; };
  }, [query, searchEnabled, location.mode, handlers]);

  function changeQuery(value: string) {
    request.current++;
    setQuery(value);
    setSearchEnabled(true);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    setStatus('idle');
    onAddressChange(undefined);
    setValue('location.placeId', '', { shouldDirty: true });
  }

  /** Any address the search finds can be posted (owner, 2026-11-21: no area limit); outside our cities it says so. */
  function chooseAddress(address: AddressSuggestion) {
    request.current++;
    setValue('location.placeId', address.placeId, { shouldDirty: true, shouldValidate: true });
    onAddressChange(address);
    setQuery(address.line1);
    setSearchEnabled(false);
    setOpen(false);
    setStatus('idle');
    setActive(-1);
  }

  function changeMode(mode: 'local' | 'remote') {
    if (mode === location.mode) return;
    request.current++;
    setValue('location', mode === 'remote' ? { mode: 'remote' } : { mode: 'local', placeId: '' }, { shouldDirty: true });
    onAddressChange(undefined);
    setQuery('');
    setSuggestions([]);
    setSearchEnabled(false);
    setOpen(false);
    setStatus('idle');
  }

  return <div className="space-y-6">
    <Controller control={control} name="location.mode" render={({ field }) => <fieldset className="space-y-3" aria-invalid={!!modeError} aria-describedby={`${id}-mode-hint${modeError ? ` ${id}-mode-error` : ''}`}>
      <legend className="mb-3 font-medium">{t('location.mode')}</legend>
      <p id={`${id}-mode-hint`} className="text-sm text-muted-foreground">{t('location.modeHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['local', ...(category?.remoteAllowed ? ['remote'] : [])] as ('local' | 'remote')[]).map((mode) => <label key={mode} className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4', location.mode === mode ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-card')}>
          <input ref={mode === 'local' ? field.ref : undefined} type="radio" name={field.name} value={mode} checked={location.mode === mode} onBlur={field.onBlur} onChange={() => changeMode(mode)} aria-describedby={`${id}-mode-hint${modeError ? ` ${id}-mode-error` : ''}`} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          <span className="font-medium">{t(`location.${mode}`)}</span>
        </label>)}
      </div>
      {modeError && <FieldError id={`${id}-mode-error`}>{modeError === 'not_supported' ? t('location.errors.not_supported') : errors(`fieldErrors.${errors.has(`fieldErrors.${modeError}`) ? modeError : 'invalid'}`)}</FieldError>}
    </fieldset>} />
    {location.mode === 'remote' ? <p className="rounded-2xl bg-secondary/70 p-4 text-sm text-foreground dark:bg-secondary/40">{t('location.remoteHint')}</p> : <>
      <Field className="gap-2" data-invalid={!!placeError}>
        <FieldLabel htmlFor={`${id}-search`}>{t('location.search')}</FieldLabel>
        <div className="relative">
          <Controller control={control} name="location.placeId" render={({ field }) => <Input ref={field.ref} name={field.name} id={`${id}-search`} value={query} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 ? `${id}-result-${active}` : undefined} aria-busy={status === 'loading'} aria-invalid={!!placeError} aria-describedby={`${id}-hint${placeError ? ` ${id}-error` : ''}`} onChange={(event) => changeQuery(event.target.value)} onFocus={() => { if (suggestions.length) setOpen(true); }} onBlur={() => { setOpen(false); field.onBlur(); }} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, suggestions.length - 1)); }
            if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => Math.max(value - 1, 0)); }
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
            if (event.key === 'Enter') { event.preventDefault(); if (open && active >= 0 && suggestions[active]) chooseAddress(suggestions[active]); }
          }} />} />
          {open && !!suggestions.length && <ul id={`${id}-results`} role="listbox" aria-label={t('location.results')} className="motion-safe:animate-in fade-in-0 zoom-in-95 absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-foreground/[0.08] bg-popover p-1.5 text-popover-foreground shadow-overlay dark:border-white/[0.08]">
            {suggestions.map((address, index) => <li key={address.placeId} id={`${id}-result-${index}`} role="option" aria-selected={active === index} className={cn('min-h-14 cursor-pointer rounded-lg p-3 text-sm', active === index && 'bg-accent')} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAddress(address)}>
              <span className="block break-words font-medium">{address.line1}</span>
              <span className="block break-words">{address.line2}</span>
              {!address.inServiceArea && <span className="mt-1 block text-muted-foreground">{t('location.outsideOption')}</span>}
            </li>)}
          </ul>}
        </div>
        <FieldDescription id={`${id}-hint`}>{t('location.searchHint')}</FieldDescription>
        {/* An address the app can't place (`not_supported`) says so: the shared message for that code is about phone numbers (sweep PT12). */}
        {placeError && <FieldError id={`${id}-error`}>{placeError === 'not_supported' ? t('location.unplaceable') : errors(`fieldErrors.${errors.has(`fieldErrors.${placeError}`) ? placeError : 'invalid'}`)}</FieldError>}
      </Field>
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {status === 'loading' && <p className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t('location.loading')}</p>}
        {status === 'error' && <p>{t('location.failed')}</p>}
        {status === 'loaded' && suggestions.length === 0 && <p>{t('location.empty')}</p>}
        {selectedAddress && <span className="sr-only">{t('location.selected')}</span>}
      </div>
      {selectedAddress ? <div className="space-y-3 rounded-2xl bg-secondary/70 p-4 text-foreground dark:bg-secondary/40">
        {selectedAddress.areaName && <p className="flex items-start gap-2 font-medium"><MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{selectedAddress.inServiceArea ? t('location.publicPreview', { area: selectedAddress.areaName, market: data.market.name }) : t('location.publicPreviewOutside', { area: selectedAddress.areaName })}</p>}
        {!selectedAddress.inServiceArea && <p className="rounded-xl border border-warning/50 bg-warning/[0.06] p-3 text-sm">{t('location.outsideNotice', { city: selectedAddress.outside?.city ?? selectedAddress.areaName ?? '' })}</p>}
        {selectedAddress.areaName && selectedAddress.areaPoint && <GeneralAreaMap location={{ kind: 'local', marketSlug: data.market.slug, marketName: data.market.name, areaName: selectedAddress.areaName, ...(selectedAddress.inServiceArea ? {} : { outsideMarket: true as const }), publicPoint: selectedAddress.areaPoint, radiusMeters: 1609 }} live={liveMap} className="h-44" />}
        <p className="flex items-start gap-2 text-sm"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('location.privateHint')}</p>
      </div> : location.placeId && <p className="rounded-2xl bg-secondary/70 p-4 text-sm text-foreground dark:bg-secondary/40">{t('location.restoreHint')}</p>}
      <TextFormField control={control} name="location.unit" label={t('location.unit')} hint={t('location.unitHint')} maxLength={20} />
      <Field className="gap-2" data-invalid={!!notesError}>
        <FieldLabel htmlFor={`${id}-notes`}>{t('location.accessNotes')}</FieldLabel>
        <Textarea {...register('location.accessNotes')} id={`${id}-notes`} rows={3} maxLength={300} aria-invalid={!!notesError} aria-describedby={`${id}-notes-hint${notesError ? ` ${id}-notes-error` : ''}`} />
        <FieldDescription id={`${id}-notes-hint`}>{t('location.accessHint')}</FieldDescription>
        {notesError && <FieldError id={`${id}-notes-error`}>{errors(`fieldErrors.${errors.has(`fieldErrors.${notesError}`) ? notesError : 'invalid'}`)}</FieldError>}
      </Field>
    </>}
  </div>;
}
