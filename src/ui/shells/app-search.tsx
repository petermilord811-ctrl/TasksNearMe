'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Briefcase, LoaderCircle, MessagesSquare, Search, Sparkles, SquarePen, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AiSearchResult, AppShellHandlers, Mode } from '@/contracts';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';
import { AiAnswer, type AiAnswerState } from '@/ui/screens/home/ai-answer';
import { buildSearchSuggestions, SEARCH_WORDS_MAX, type SearchSuggestion } from './app-search-suggestions';
import { getAppNav } from './nav';

/** The examples the placeholder types out, by mode (copy: `shell.search.examples.<mode>.<key>`). */
const EXAMPLES = { poster: ['wardrobe', 'couch', 'leaves', 'laptop'], helper: ['assembly', 'moving', 'yard', 'remote'] } as const;
const TYPE_MS = 42;
const ERASE_MS = 18;
const HOLD_MS = 1900;

/**
 * The placeholder's examples, typed out and erased one after another while the field is empty (reduced motion: the
 * first one, still). Drawn over the field and hidden from assistive tech; the field's own label says what it's for.
 */
function useTypedExample(examples: readonly string[], paused: boolean): string {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (reduced || paused || examples.length === 0) return;
    let index = 0;
    let length = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const example = examples[index % examples.length] ?? '';
      if (!erasing) {
        length += 1;
        setShown(example.slice(0, length));
        if (length >= example.length) {
          erasing = true;
          timer = setTimeout(tick, HOLD_MS);
          return;
        }
        timer = setTimeout(tick, TYPE_MS);
        return;
      }
      length -= 1;
      setShown(example.slice(0, Math.max(0, length)));
      if (length <= 0) {
        erasing = false;
        index += 1;
        timer = setTimeout(tick, 380);
        return;
      }
      timer = setTimeout(tick, ERASE_MS);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [examples, paused, reduced]);
  return reduced || paused ? (examples[0] ?? '') : shown;
}

const ICONS = { ask_ai: Sparkles, post_task: SquarePen, find_work: Briefcase, find_helpers: Users, neighbors: MessagesSquare, page: ArrowUpRight } as const;

/**
 * The search bar at the top of the app's pages (owner, 2026-11-23: "show search bar on that place (AI search and
 * animated, very helpful features)"), where the helper setup bar was. As someone types it suggests where the words lead,
 * read on the device: post them as a task (the category it sounds like, a title), find helpers or tasks for it, search
 * Neighbors, or a page by name. Ask AI sends the words to the dashboard's AI search (`onAsk`, counted by the plan) and
 * shows real helpers and tasks under the field. `/` or Ctrl/⌘ K focuses it from anywhere on the page.
 */
export function AppSearch({ mode, onAsk, onNeighbors = false, className }: { mode: Mode; onAsk?: AppShellHandlers['onAskSearch']; onNeighbors?: boolean; className?: string }) {
  const t = useTranslations('shell.search');
  const nav = useTranslations('shell.nav');
  const category = useTranslations('shell.categories');
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [answer, setAnswer] = useState<AiAnswerState | null>(null);
  const asking = useRef(false);

  const examples = useMemo(() => EXAMPLES[mode].map((key) => t(`examples.${mode}.${key}`)), [mode, t]);
  const typed = useTypedExample(examples, focused || text.length > 0);
  const pages = useMemo(() => {
    const appNav = getAppNav(mode);
    return [...appNav.primary, ...appNav.secondary, ...appNav.account].map((item) => ({ item, label: nav(item.id) }));
  }, [mode, nav]);
  const suggestions = useMemo(() => buildSearchSuggestions({ text, mode, aiAvailable: Boolean(onAsk), onNeighbors, pages }), [text, mode, onAsk, onNeighbors, pages]);
  const shortcuts = useMemo(() => pages.slice(0, 4), [pages]);

  // `/` and Ctrl/⌘ K focus the field, unless someone is typing somewhere else.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A press outside closes the panel (the answer stays until it's closed or the words change).
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  async function ask() {
    if (!onAsk || asking.current) return;
    const words = text.trim();
    if (words.length < 3) return;
    asking.current = true;
    setAnswer({ status: 'pending', text: words });
    let result: AiSearchResult;
    try {
      result = await onAsk({ text: words });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    asking.current = false;
    setAnswer({ status: 'done', text: words, result });
  }

  function choose(suggestion: SearchSuggestion) {
    if (suggestion.kind === 'ask_ai') {
      void ask();
      return;
    }
    setOpen(false);
    // On Neighbors, a search there keeps the page's filters (the place, the type, the sort), as its own field did.
    if (suggestion.kind === 'neighbors' && onNeighbors && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.delete('page');
      params.set('q', text.replace(/\s+/g, ' ').trim().slice(0, SEARCH_WORDS_MAX));
      router.push(`${window.location.pathname}?${params.toString()}`);
      return;
    }
    router.push(suggestion.href);
  }

  function label(suggestion: SearchSuggestion) {
    const words = text.trim();
    switch (suggestion.kind) {
      case 'ask_ai':
        return { title: t('askAi'), hint: t('askAiHint') };
      case 'post_task':
        return { title: t('postTask', { title: suggestion.title }), hint: suggestion.category ? t('postTaskHint', { category: category(suggestion.category) }) : t('postTaskHintAny') };
      case 'find_work':
        return { title: suggestion.category ? t('findWorkCategory', { category: category(suggestion.category) }) : t('findWork', { words }), hint: t('findWorkHint') };
      case 'find_helpers':
        return { title: suggestion.category ? t('findHelpersCategory', { category: category(suggestion.category) }) : t('findHelpers', { words }), hint: t('findHelpersHint') };
      case 'neighbors':
        return { title: t('neighbors', { words }), hint: t('neighborsHint') };
      case 'page':
        return { title: nav(suggestion.nav), hint: t('page') };
    }
  }

  const showPanel = open && (focused || answer !== null);
  const activeId = active >= 0 && suggestions[active] ? `${id}-option-${active}` : undefined;
  // While the suggestions are open, above the page's own sticky bars (layer-action) and below the pinned app bar
  // (layer-navigation) and the page-change veil (#main::after); at rest, no layer, so it scrolls under the bar.
  return <div ref={rootRef} className={cn('relative min-w-0 flex-1', showPanel && 'z-[calc(var(--layer-navigation)-1)]', className)}>
    <form
      role="search"
      aria-label={t('label')}
      onSubmit={(event) => {
        event.preventDefault();
        const pick = suggestions[active >= 0 ? active : 0];
        if (pick) choose(pick);
      }}
      className="group/search relative rounded-full p-px transition-shadow duration-300 ease-[var(--ease-out)] focus-within:shadow-[0_18px_44px_-24px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
    >
      {/* The ring: quiet at rest, a slow warm gradient while the field has focus. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-foreground/[0.09] transition-opacity duration-300 group-focus-within/search:opacity-0 dark:bg-white/[0.1]" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(110deg,var(--primary),#f59e0b,#ec4899,#8b5cf6,var(--primary))] bg-[length:300%_100%] opacity-0 transition-opacity duration-300 group-focus-within/search:opacity-100 motion-safe:animate-[hue-drift_7s_ease-in-out_infinite]" />
      <div className="relative flex min-h-12 items-center gap-2 rounded-full bg-card/95 pr-1.5 pl-4 backdrop-blur-md dark:bg-card">
        <span aria-hidden="true" className="relative grid size-6 shrink-0 place-items-center text-primary">
          <Sparkles className="size-[1.15rem] motion-safe:animate-[drift_3.2s_ease-in-out_infinite]" />
        </span>
        <label htmlFor={`${id}-input`} className="sr-only">{t('label')}</label>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="search"
            role="combobox"
            aria-expanded={showPanel && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={SEARCH_WORDS_MAX}
            value={text}
            onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1); if (answer && answer.status === 'done') setAnswer(null); }}
            onFocus={() => { setFocused(true); setOpen(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, suggestions.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, -1)); }
              if (event.key === 'Escape') { if (open) { event.preventDefault(); setOpen(false); } else if (text) { event.preventDefault(); setText(''); setAnswer(null); } }
            }}
            className="peer h-11 w-full min-w-0 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-transparent [&::-webkit-search-cancel-button]:hidden"
          />
          {!text && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center truncate text-[0.9375rem] text-muted-foreground">
            <span className="truncate">{focused ? t('placeholderFocused') : typed}</span>
            {!focused && <span className="ml-px inline-block h-4 w-px shrink-0 bg-primary/70 motion-safe:animate-pulse motion-reduce:hidden" />}
          </span>}
        </div>
        <span id={`${id}-hint`} className="sr-only">{t('hint')}</span>
        {text ? <button type="button" onClick={() => { setText(''); setAnswer(null); setActive(-1); inputRef.current?.focus(); }} aria-label={t('clear')} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>
          : <kbd aria-hidden="true" className="mr-2 hidden h-6 min-w-6 shrink-0 place-items-center rounded-md border border-foreground/[0.12] bg-background/70 px-1.5 font-sans text-xs font-medium text-muted-foreground sm:grid">/</kbd>}
        <button type="submit" aria-label={t('submit')} disabled={!text.trim()} className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[opacity,transform] duration-200 ease-[var(--ease-out)] enabled:hover:scale-105 disabled:opacity-0">
          {answer?.status === 'pending' ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowRight aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </form>

    {showPanel && <div className="motion-safe:animate-in fade-in-0 slide-in-from-top-1 absolute inset-x-0 top-full z-40 mt-2 max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain rounded-[1.375rem] border border-foreground/[0.08] bg-popover p-2 text-popover-foreground shadow-overlay dark:border-white/[0.08]">
      {suggestions.length > 0 ? <ul id={listId} role="listbox" aria-label={t('suggestions')} className="space-y-0.5">
        {suggestions.map((suggestion, index) => {
          const Icon = ICONS[suggestion.kind];
          const { title, hint } = label(suggestion);
          return <li key={suggestion.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(suggestion)}
            className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors', active === index ? 'bg-accent' : 'hover:bg-accent/60')}>
            <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-xl', suggestion.kind === 'ask_ai' ? 'bg-[linear-gradient(135deg,var(--primary),#ec4899)] text-white shadow-sm' : 'bg-secondary text-primary dark:bg-secondary/60')}><Icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium [overflow-wrap:anywhere]">{title}</span>
              <span className="block truncate text-[0.8125rem] text-muted-foreground">{hint}</span>
            </span>
            {index === 0 && <kbd aria-hidden="true" className="hidden rounded-md border border-foreground/[0.12] px-1.5 py-0.5 font-sans text-[0.6875rem] text-muted-foreground sm:block">{t('enter')}</kbd>}
          </li>;
        })}
      </ul> : !text.trim() && <div className="space-y-3 p-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t('tryAsking')}</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => <button key={example} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setText(example); setActive(0); inputRef.current?.focus(); }} className="rounded-full border border-foreground/[0.1] bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-brand-soft dark:border-white/[0.1]">{example}</button>)}
        </div>
        <p className="pt-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t('jumpTo')}</p>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {shortcuts.map(({ item, label: name }) => <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-accent">{name}</Link>)}
        </div>
      </div>}
      {answer && <div className={cn(suggestions.length > 0 && 'mt-2')}><AiAnswer state={answer} onClose={() => setAnswer(null)} /></div>}
      {text.trim().length > 0 && text.trim().length < 2 && <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Search aria-hidden="true" className="size-4" />{t('keepTyping')}</p>}
    </div>}
  </div>;
}
