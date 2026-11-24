'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { Search } from 'lucide-react';
import type { GifResult, GifSearchError, GifSearchInput, GifSearchResult, PhotoUploadResult, QueryHandler } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Skeleton } from '@/ui/primitives/skeleton';
import { Spinner } from '@/ui/primitives/spinner';

/** GIFs per row: the arrow keys move by this much up and down. */
export const GIF_COLUMNS = 3;
const SEARCH_DELAY_MS = 350;

/** What the panel shows: a query's results (trending for ''), loading, or failed; and "Load more"'s own state. */
export interface GifPanelState {
  query: string;
  status: 'loading' | 'ready' | 'error';
  results: GifResult[];
  nextPage?: number;
  error?: GifSearchError;
  more?: 'loading' | 'error';
}

const WIDE = '(min-width: 640px)';
function subscribeWide(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(WIDE);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
/** Wide screens get a popover above the button; phones (and the first paint) a sheet from the bottom. */
function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(WIDE).matches, () => false);
}

/**
 * The composer's GIF button (2026-11-24): a picker with trending GIFs first, a search, and "Load more". Picking one
 * closes it and hands the GIF to `onPick`, which sends it at once. `busy`: a message is on its way (the button stays
 * focusable, so focus can come back to it).
 */
export function GifPicker({ onSearch, onPick, busy = false, compact = false }: {
  onSearch: QueryHandler<GifSearchInput, GifSearchResult>;
  onPick(gif: GifResult): void;
  busy?: boolean;
  /** In the chat window: the size of the paperclip beside it there. */
  compact?: boolean;
}) {
  const t = useTranslations('thread.composer.gif');
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const onOpenChange = (next: boolean) => {
    if (next && busy) return;
    setOpen(next);
  };
  const pick = (gif: GifResult) => {
    setOpen(false);
    onPick(gif);
  };
  const trigger = <button type="button" aria-label={t('open')} title={t('open')} aria-disabled={busy || undefined} className={cn('grid shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-ring aria-disabled:opacity-40', compact ? 'size-10' : 'size-10 sm:h-12 sm:w-11')}>
    <span aria-hidden="true" className="rounded-[5px] border-2 border-current px-1 text-[10px] font-extrabold leading-[14px] tracking-wide">{t('button')}</span>
  </button>;
  const panel = <GifPickerPanel onSearch={onSearch} onPick={pick} />;
  if (wide) {
    return <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" aria-labelledby={titleId} className="w-[22rem] max-w-[calc(100vw-2rem)] p-3">
        <h3 id={titleId} className="sr-only">{t('title')}</h3>
        {panel}
      </PopoverContent>
    </Popover>;
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    {/* A phone's keyboard stays down until the search is tapped: the sheet itself takes focus, trending shows first. */}
    <DialogContent ref={sheet} tabIndex={-1} aria-describedby={undefined} onOpenAutoFocus={(event) => { event.preventDefault(); sheet.current?.focus(); }} className="gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle></DialogHeader>
      {panel}
    </DialogContent>
  </Dialog>;
}

/**
 * The picker's contents: the search field, the GIFs (arrow keys, Home and End move between them; Up from the first
 * row goes back to the search, Down from the search into the GIFs), "Load more", and KLIPY's attribution. It asks for
 * trending as it opens; `seed` shows a state without asking (previews).
 */
export function GifPickerPanel({ onSearch, onPick, seed }: {
  onSearch: QueryHandler<GifSearchInput, GifSearchResult>;
  onPick(gif: GifResult): void;
  seed?: GifPanelState;
}) {
  const t = useTranslations('thread.composer.gif');
  const id = useId();
  const [text, setText] = useState(seed?.query ?? '');
  const [state, setState] = useState<GifPanelState>(seed ?? { query: '', status: 'loading', results: [] });
  const [active, setActive] = useState(0);
  const asked = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchField = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  async function run(query: string, page: number) {
    const ticket = ++asked.current;
    if (page === 1) setState({ query, status: 'loading', results: [] });
    else setState((current) => ({ ...current, more: 'loading' }));
    let answer: GifSearchResult;
    try { answer = await onSearch({ q: query, page }); } catch { answer = { ok: false, code: 'unavailable' }; }
    if (!mounted.current || ticket !== asked.current) return;
    if (page === 1) {
      setActive(0);
      setState(answer.ok ? { query, status: 'ready', results: answer.results, ...(answer.nextPage ? { nextPage: answer.nextPage } : {}) } : { query, status: 'error', results: [], error: answer.code });
      return;
    }
    setState((current) => {
      if (!answer.ok) return { ...current, more: 'error' };
      const seen = new Set(current.results.map((gif) => gif.id));
      const results = [...current.results, ...answer.results.filter((gif) => !seen.has(gif.id))];
      return { query: current.query, status: current.status, results, ...(current.error ? { error: current.error } : {}), ...(answer.nextPage ? { nextPage: answer.nextPage } : {}) };
    });
  }

  useEffect(() => {
    mounted.current = true;
    // Trending as it opens (deferred: no state set while the effect runs).
    const first = seed ? undefined : setTimeout(() => void run('', 1), 0);
    return () => {
      mounted.current = false;
      clearTimeout(first);
      clearTimeout(timer.current);
    };
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function typed(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(value.trim(), 1), SEARCH_DELAY_MS);
  }

  const count = state.results.length;
  const current = Math.min(active, Math.max(0, count - 1));
  function focusGif(index: number) {
    setActive(index);
    grid.current?.querySelector<HTMLButtonElement>(`[data-gif-index="${index}"]`)?.focus();
  }
  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = Math.min(count - 1, current + 1); break;
      case 'ArrowLeft': next = Math.max(0, current - 1); break;
      case 'ArrowDown': next = Math.min(count - 1, current + GIF_COLUMNS); break;
      case 'ArrowUp':
        if (current < GIF_COLUMNS) { event.preventDefault(); searchField.current?.focus(); return; }
        next = current - GIF_COLUMNS;
        break;
      case 'Home': next = 0; break;
      case 'End': next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    focusGif(next);
  }

  const heading = state.query ? t('results', { query: state.query }) : t('trending');
  const announcement = state.status === 'loading' ? t('loading')
    : state.status === 'error' ? t(state.error === 'rate_limited' ? 'rateLimited' : 'error')
      : count === 0 ? (state.query ? t('empty', { query: state.query }) : t('emptyTrending')) : t('count', { count });
  // One height whatever it shows (2026-11-24, owner: "when GIF loading, window size gets changed"): loading, results,
  // nothing found or an error, and the row under it keeps its height with or without "Load more".
  return <div className="flex h-[min(65dvh,30rem)] min-h-0 flex-col gap-2.5" data-gif-panel="">
    <div className="relative">
      <label htmlFor={`${id}-search`} className="sr-only">{t('search')}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input ref={searchField} id={`${id}-search`} type="search" value={text} maxLength={100} autoComplete="off" enterKeyHint="search" placeholder={t('search')}
        onChange={(event) => typed(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); clearTimeout(timer.current); void run(text.trim(), 1); }
          else if (event.key === 'ArrowDown' && count > 0) { event.preventDefault(); focusGif(current); }
        }}
        className="h-11 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm" />
    </div>
    <p id={`${id}-heading`} className="text-xs font-semibold text-muted-foreground">{heading}</p>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={state.status === 'loading' || state.more === 'loading'}>
      {state.status === 'loading' && <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{Array.from({ length: 15 }, (_, index) => <Skeleton key={index} className="aspect-4/3 rounded-lg" />)}</div>}
      {state.status === 'error' && <div className="space-y-2 rounded-xl border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">{t(state.error === 'rate_limited' ? 'rateLimited' : 'error')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void run(state.query, 1)}>{t('retry')}</Button>
      </div>}
      {state.status === 'ready' && count === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{state.query ? t('empty', { query: state.query }) : t('emptyTrending')}</p>}
      {state.status === 'ready' && count > 0 && <div ref={grid} role="group" aria-labelledby={`${id}-heading`} onKeyDown={onGridKey} className="grid grid-cols-3 gap-1.5">
        {state.results.map((gif, index) => <button key={gif.id} type="button" data-gif-index={index} tabIndex={index === current ? 0 : -1} onFocus={() => setActive(index)} onClick={() => onPick(gif)}
          aria-label={t('pick', { title: gif.title || t('untitled') })}
          className="group relative aspect-4/3 overflow-hidden rounded-lg bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <picture>
            {gif.still && <source media="(prefers-reduced-motion: reduce)" srcSet={gif.still} />}
            <img src={gif.preview.src} alt={gif.title || t('untitled')} width={gif.preview.width} height={gif.preview.height} loading="lazy" decoding="async" className="size-full object-cover transition-transform group-hover:scale-105 motion-reduce:transition-none" />
          </picture>
        </button>)}
      </div>}
    </div>
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
      {state.status === 'ready' && state.nextPage
        ? <Button type="button" variant="outline" size="sm" disabled={state.more === 'loading'} aria-busy={state.more === 'loading'} onClick={() => { if (state.nextPage) void run(state.query, state.nextPage); }}>
            {state.more === 'loading' ? <><Spinner aria-hidden="true" />{t('loadingMore')}</> : t('more')}
          </Button>
        : <span />}
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">{t('attribution')}</p>
    </div>
    {state.more === 'error' && <p role="alert" className="text-xs text-destructive">{t('moreFailed')}</p>}
  </div>;
}

/** Copy for an attach error, under `thread.composer`. */
export function gifFailureKey(code: Extract<PhotoUploadResult, { ok: false }>['code']): `gif.failed.${Extract<PhotoUploadResult, { ok: false }>['code']}` {
  return `gif.failed.${code}`;
}
