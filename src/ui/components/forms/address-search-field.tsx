'use client';

import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AddressSuggestion } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';

/**
 * An address combobox: type at least 3 characters, pick a suggestion (arrow keys and Enter work).
 * Suggestions outside the area (`inServiceArea: false`) can't be picked; `outOfAreaMessage` says why.
 * The app finds and confirms addresses; this only shows what `onSearch` returns.
 */
export function AddressSearchField({
  label,
  hint,
  onSearch,
  selected,
  onSelect,
  error,
  outOfAreaMessage,
  disabled = false,
  inputRef,
  initialSuggestions,
}: {
  label: string;
  hint: string;
  onSearch: (input: { query: string }) => Promise<AddressSuggestion[]>;
  selected?: AddressSuggestion;
  onSelect: (address: AddressSuggestion | undefined) => void;
  /** Already worded. */
  error?: string;
  outOfAreaMessage: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Previews: open with these suggestions. */
  initialSuggestions?: AddressSuggestion[];
}) {
  const t = useTranslations('forms.addressSearch');
  const id = useId();
  const [query, setQuery] = useState(selected?.line1 ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>(initialSuggestions ?? []);
  const [open, setOpen] = useState(!!initialSuggestions?.length);
  const [active, setActive] = useState(-1);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [outOfArea, setOutOfArea] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (!searchEnabled || query.trim().length < 3) return;
    const current = ++request.current;
    let canceled = false;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const results = await onSearch({ query: query.trim() });
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
  }, [query, searchEnabled, onSearch]);

  function change(value: string) {
    request.current++;
    setQuery(value);
    setSearchEnabled(true);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    setOutOfArea(false);
    setStatus('idle');
    onSelect(undefined);
  }

  function choose(address: AddressSuggestion) {
    if (!address.inServiceArea) { setOutOfArea(true); setOpen(false); return; }
    request.current++;
    onSelect(address);
    setQuery(address.line1);
    setSearchEnabled(false);
    setOpen(false);
    setOutOfArea(false);
    setStatus('idle');
    setActive(-1);
  }

  const describedBy = `${id}-hint${error ? ` ${id}-error` : ''}`;
  return <div className="space-y-2">
    <Field className="gap-2" data-invalid={!!error}>
      <FieldLabel htmlFor={`${id}-search`}>{label}</FieldLabel>
      <div className="relative">
        <Input ref={inputRef} id={`${id}-search`} value={query} disabled={disabled} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 ? `${id}-result-${active}` : undefined} aria-busy={status === 'loading'} aria-invalid={!!error} aria-describedby={describedBy} onChange={(event) => change(event.target.value)} onFocus={() => { if (suggestions.length) setOpen(true); }} onBlur={() => setOpen(false)} onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, suggestions.length - 1)); }
          if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setOpen(true); setActive((value) => Math.max(value - 1, 0)); }
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
          if (event.key === 'Enter') { event.preventDefault(); if (open && active >= 0 && suggestions[active]) choose(suggestions[active]); }
        }} />
        {open && !!suggestions.length && <ul id={`${id}-results`} role="listbox" aria-label={t('results')} className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map((address, index) => <li key={address.placeId} id={`${id}-result-${index}`} role="option" aria-selected={active === index} aria-disabled={!address.inServiceArea} className={cn('min-h-14 cursor-pointer rounded-lg p-3 text-sm', active === index && 'bg-accent', !address.inServiceArea && 'text-muted-foreground')} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(address)}>
            <span className="block break-words font-medium">{address.line1}</span>
            <span className="block break-words">{address.line2}</span>
            {!address.inServiceArea && <span className="mt-1 block font-medium">{outOfAreaMessage}</span>}
          </li>)}
        </ul>}
      </div>
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
    <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {status === 'loading' && <p className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t('loading')}</p>}
      {status === 'error' && <p>{t('failed')}</p>}
      {status === 'loaded' && suggestions.length === 0 && <p>{t('empty')}</p>}
      {selected && <span className="sr-only">{t('selected', { address: `${selected.line1}, ${selected.line2}` })}</span>}
    </div>
    {outOfArea && <p className="rounded-lg border border-warning p-4 text-sm font-medium">{outOfAreaMessage}</p>}
  </div>;
}
