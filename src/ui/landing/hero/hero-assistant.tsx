'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, Check, ChevronDown, History, Info, Laptop, MapPinned, MessageCircleQuestion, Mic, Sparkles, Square, WandSparkles, X } from 'lucide-react';
import {
  CATEGORY_DETAIL_FIELDS,
  CATEGORY_SLUGS,
  routes,
  type CategorySlug,
  type CategoryView,
  type HomePageData,
  type ISODateTime,
  type LandingAiDraft,
  type LandingAiSuggestResult,
  type MapArea,
} from '@/contracts';
import { formatMoney } from '@/shared/format';
import { readTaskIntent, type TaskIntent } from '@/shared/task-intent';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { useLandingHandlers } from '../landing-handlers';
import { scrollToMap, useOptionalLanding } from '../landing-state';
import { ConfidenceBars, confidenceLevel, moveWithArrows, TypewriterHint, useReveal, useSpeechInput } from './assistant-parts';
import { RewardBadge } from './reward-badge';
import { useSeason } from '../season';
import { seasonAt } from './seasons';

/** Who the assistant serves: someone posting a task ("I need help to…") or a helper ("I can…"). */
export type AssistantMode = 'poster' | 'helper';

type AiCode = Extract<LandingAiSuggestResult, { ok: false }>['code'];
type AiState = { status: 'idle' } | { status: 'thinking' } | { status: 'done'; draft: LandingAiDraft } | { status: 'error'; code: AiCode };

const LIMIT: Record<AssistantMode, number> = { poster: 280, helper: 160 };
/** The "N characters left" note shows this close to the limit. */
const COUNT_FROM = 40;
const LINE = 24;
const storageKey = (mode: AssistantMode) => `tnm:assistant:${mode}:v1`;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readSaved(mode: AssistantMode): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(mode));
  } catch {
    return null;
  }
}
function writeSaved(mode: AssistantMode, value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(storageKey(mode), value);
    else window.sessionStorage.removeItem(storageKey(mode));
  } catch {
    /* storage blocked: nothing to restore later */
  }
}
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * The hero's assistant as one model for both audiences: what's typed (each audience keeps its own), the instant
 * reading (`readTaskIntent`: the kind of help, a title, how sure), whether the suggestions are open, and the AI
 * draft. It opens on focus or typing, and when the field is left with words in it, it folds into a one-line summary
 * (`collapsed`) that the hero shows in place of its line of new tasks; a click on the summary opens it again.
 * Escape or a click elsewhere folds it; clearing the words brings the line of new tasks back.
 */
export function useHeroAssistant({ data, now, mode, area }: { data: HomePageData; now: ISODateTime; mode: AssistantMode; area: MapArea | null }) {
  const tHero = useTranslations('landing.hero');
  const landing = useOptionalLanding();
  const { onSuggestWithAi } = useLandingHandlers();
  const reduced = usePrefersReducedMotion();
  const id = useId();
  const [texts, setTexts] = useState<Record<AssistantMode, string>>({ poster: '', helper: '' });
  const [picks, setPicks] = useState<Record<AssistantMode, CategorySlug | null>>({ poster: null, helper: null });
  const [expanded, setExpanded] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  // Words typed earlier in this tab and never sent (offered back, never restored by themselves).
  const [offers, setOffers] = useState<Record<AssistantMode, string | null>>(() =>
    typeof window === 'undefined' ? { poster: null, helper: null } : { poster: readSaved('poster'), helper: readSaved('helper') },
  );
  const [onScreen, setOnScreen] = useState(false);
  const tabVisible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  // The model finds its nodes by their ids (set by `HeroAssistant`), so it hands the components no refs.
  const nodes = useMemo(
    () => ({
      root: () => document.getElementById(`${id}-root`),
      field: () => document.getElementById(`${id}-input`) as HTMLTextAreaElement | null,
      form: () => document.getElementById(`${id}-form`) as HTMLFormElement | null,
    }),
    [id],
  );
  const focusField = useCallback(() => nodes.field()?.focus(), [nodes]);
  const request = useRef(0);
  const sent = useRef(false);

  const text = texts[mode];
  const trimmed = text.trim();
  const picked = picks[mode];
  const intent: TaskIntent = useMemo(() => readTaskIntent(text), [text]);
  const category = picked ?? intent.category;
  const view: CategoryView | undefined = category ? data.categories.find((item) => item.slug === category) : undefined;
  const typed = trimmed.length >= 3 || (mode === 'helper' && picked !== null);
  const collapsed = !expanded && trimmed.length > 0;
  // The landing's season (a `?season=` link shows another's examples too), or the calendar's.
  const season = useSeason() ?? seasonAt(now, data.market.timeZone);
  const examples = useMemo(() => CATEGORY_SLUGS.map((slug) => tHero(`seasons.${season}.${slug}`)), [tHero, season]);
  const place = area?.name ?? data.market.name;
  const matching = category ? data.map.pins.filter((pin) => pin.categorySlug === category && (!area || pin.areaName === area.name)).length : 0;
  const aiAvailable = mode === 'poster' && data.aiDraftingEnabled;
  const canWrite = aiAvailable && Boolean(onSuggestWithAi);
  const offer = offers[mode] && offers[mode] !== text ? offers[mode] : null;
  const countLeft = text.length >= LIMIT[mode] - COUNT_FROM ? LIMIT[mode] - text.length : null;

  const continueHref = mode === 'helper' ? routes.becomeAHelper() : routes.app.newTask({ ...(category ? { category } : {}), ...(trimmed ? { describe: trimmed } : {}) });
  const draftHref = ai.status === 'done' && category ? routes.app.newTask({ category, title: ai.draft.title, describe: ai.draft.description }) : null;
  const wizardAiHref = aiAvailable && category && trimmed ? routes.app.newTask({ category, describe: trimmed, ai: true }) : null;

  // A switch of audience folds the suggestions (each audience keeps its own words).
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setExpanded(false);
    setChoosing(false);
  }

  const close = useCallback(() => {
    setExpanded(false);
    setChoosing(false);
  }, []);
  /** Opens the suggestions (the field got focus). */
  const open = useCallback(() => setExpanded(true), []);
  // Wide screens: the hero is pinned and the map slides up over it as the page scrolls, so a scroll folds the
  // suggestions instead of letting the map cover them (a moment's grace for the "/" shortcut's own scroll).
  useEffect(() => {
    if (!expanded || typeof window.matchMedia !== 'function' || !window.matchMedia('(min-width: 1024px)').matches) return;
    const openedAt = performance.now();
    let from = window.scrollY;
    const onScroll = () => {
      if (performance.now() - openedAt < 700) {
        from = window.scrollY;
        return;
      }
      if (Math.abs(window.scrollY - from) > 72) {
        setExpanded(false);
        setChoosing(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [expanded]);
  /** Opens them from the folded summary, and puts the cursor back in the field. */
  const expand = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => nodes.field()?.focus({ preventScroll: true }));
  }, [nodes]);
  const setText = useCallback(
    (value: string) => {
      setTexts((current) => ({ ...current, [mode]: value.slice(0, LIMIT[mode]) }));
      setPicks((current) => ({ ...current, [mode]: null }));
      setOffers((current) => ({ ...current, [mode]: null }));
      setExpanded(true);
      // A new request: an earlier AI draft (or one on its way) no longer fits the words.
      request.current += 1;
      setAi({ status: 'idle' });
    },
    [mode],
  );
  const clear = useCallback(() => {
    setText('');
    writeSaved(mode, null);
    focusField();
  }, [mode, setText, focusField]);
  const choose = useCallback(
    (slug: CategorySlug) => {
      setPicks((current) => ({ ...current, [mode]: slug }));
      setChoosing(false);
      focusField();
    },
    [mode, focusField],
  );
  const restore = useCallback(() => {
    if (offer) setText(offer);
    focusField();
  }, [offer, setText, focusField]);
  /** The words were sent on (a link to the next step was followed): nothing left to restore. */
  const forget = useCallback(() => {
    sent.current = true;
    writeSaved(mode, null);
  }, [mode]);

  const speech = useSpeechInput((words) => setText(words));
  const toggleVoice = () => {
    if (speech.listening) speech.stop();
    else {
      setExpanded(true);
      speech.start();
    }
  };

  const writeWithAi = async () => {
    if (!onSuggestWithAi || !category || ai.status === 'thinking') return;
    const ticket = (request.current += 1);
    setAi({ status: 'thinking' });
    let result: LandingAiSuggestResult;
    try {
      result = await onSuggestWithAi({ text: trimmed, category });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    if (ticket !== request.current) return;
    setAi(result.ok ? { status: 'done', draft: result.draft } : { status: 'error', code: result.code });
  };
  const keepWords = () => {
    request.current += 1;
    setAi({ status: 'idle' });
  };

  // Unsent words are kept for this tab (a reload offers them back).
  useEffect(() => {
    if (sent.current) return;
    const timer = window.setTimeout(() => writeSaved(mode, trimmed || null), 400);
    return () => window.clearTimeout(timer);
  }, [mode, trimmed]);

  // The field grows to three lines while open, and shows one when folded.
  useIsoLayoutEffect(() => {
    const field = nodes.field();
    if (!field) return;
    field.style.height = 'auto';
    const style = window.getComputedStyle(field);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    field.style.height = `${Math.min(Math.max(field.scrollHeight, LINE + padding), (expanded ? LINE * 3 : LINE) + padding)}px`;
  }, [text, expanded, nodes]);

  // Only animate while it's on screen.
  useEffect(() => {
    const root = nodes.root();
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)));
    seen.observe(root);
    return () => seen.disconnect();
  }, [nodes]);

  // Fold on a click elsewhere, or Escape.
  useEffect(() => {
    if (!expanded) return;
    const onPointer = (event: PointerEvent) => {
      if (!nodes.root()?.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      nodes.field()?.blur();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded, close, nodes]);

  // "/" anywhere on the page (outside another field) starts typing here.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const field = nodes.field();
      if (!field) return;
      event.preventDefault();
      field.focus({ preventScroll: true });
      const box = field.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) field.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [reduced, nodes]);

  // The town's pins and the map preview the kind of help while the suggestions are open.
  const preview = expanded && typed ? category : null;
  const setPreview = landing?.setPreviewCategory;
  useEffect(() => {
    setPreview?.(preview);
  }, [preview, setPreview]);
  useEffect(() => () => setPreview?.(null), [setPreview]);

  const seeTasks = () => {
    if (!category) return;
    landing?.selectCategory(category);
    close();
    scrollToMap();
  };

  return {
    mode,
    data,
    area,
    place,
    id,
    focusField,
    reduced,
    text,
    trimmed,
    typed,
    intent,
    picked,
    category,
    view,
    matching,
    expanded,
    collapsed,
    choosing,
    setChoosing,
    examples,
    typing: !text && !reduced && onScreen && tabVisible && !speech.listening,
    onScreen,
    offer,
    countLeft,
    ai,
    aiAvailable,
    canWrite,
    continueHref,
    draftHref,
    wizardAiHref,
    speech,
    setText,
    clear,
    choose,
    restore,
    forget,
    open,
    expand,
    close,
    toggleVoice,
    writeWithAi,
    keepWords,
    seeTasks,
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      // Focus moving out (Tab) folds it; a click on plain text inside moves focus nowhere and keeps it open.
      const next = event.relatedTarget as Node | null;
      if (next && !event.currentTarget.contains(next)) close();
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter goes on (Shift+Enter makes a new line).
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      forget();
      nodes.form()?.requestSubmit();
    },
  };
}

export type HeroAssistantModel = ReturnType<typeof useHeroAssistant>;

const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;

/**
 * The assistant itself: one input bar for both audiences that grows into a card of suggestions over the page
 * (it sits in a fixed-height slot, so nothing around it moves). A soft ring turns around it while it's in use, the
 * examples type themselves out while it's empty, and the field grows to three lines for longer words. A plain
 * GET form underneath: posters go on to the posting wizard with their words, helpers to "Become a helper".
 */
export function HeroAssistant({ assistant: a, className }: { assistant: HeroAssistantModel; className?: string }) {
  const t = useTranslations('landing.assistant');
  const tHero = useTranslations('landing.hero');
  const categoryName = useTranslations('helperCard.categories');
  const helper = a.mode === 'helper';
  const inputId = `${a.id}-input`;
  const statusId = `${a.id}-status`;
  const panelId = `${a.id}-panel`;
  const ringActive = a.expanded && a.onScreen ? '' : undefined;
  // The suggestions' height follows their content (measured, so the spring never stretches the text).
  const [panelHeight, setPanelHeight] = useState(0);
  const sizer = useRef<ResizeObserver | null>(null);
  // It never runs past the bottom of the screen (the hero is pinned on wide screens, so the page can't scroll to
  // it): capped to the room below the bar, it scrolls inside, and its actions stay pinned at its foot.
  const panelRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    if (!a.expanded) return;
    const update = () => {
      const top = panelRef.current?.getBoundingClientRect().top;
      if (top !== undefined) setRoom(Math.max(180, Math.floor(window.innerHeight - top - 12)));
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [a.expanded]);
  const shownHeight = panelHeight ? (room ? Math.min(panelHeight, room) : panelHeight) : 'auto';
  const measure = useCallback((node: HTMLDivElement | null) => {
    sizer.current?.disconnect();
    if (!node || typeof ResizeObserver === 'undefined') return;
    sizer.current = new ResizeObserver(([entry]) => setPanelHeight(Math.ceil(entry?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight)));
    sizer.current.observe(node);
  }, []);

  return (
    <LazyMotion features={domMax}>
      <div id={`${a.id}-root`} className={cn('relative h-15 w-full max-w-[32rem]', className)} onBlur={a.onBlur}>
        <div className="absolute inset-x-0 top-0 z-30">
          {/* The ring, and its glow: only while in use. */}
          <span aria-hidden="true" data-active={ringActive} className={cn('assistant-ring pointer-events-none absolute -inset-[2px] rounded-[1.9rem] opacity-0 transition-opacity duration-500', a.expanded && 'opacity-100')} />
          <span aria-hidden="true" data-active={ringActive} className={cn('assistant-ring pointer-events-none absolute -inset-1.5 rounded-[2.2rem] opacity-0 blur-xl transition-opacity duration-700', a.expanded && 'opacity-30')} />
          <div
            className={cn(
              'relative overflow-hidden rounded-[1.75rem] border bg-card transition-[box-shadow,border-color] duration-300',
              a.expanded ? 'border-transparent shadow-overlay' : 'border-foreground/10 shadow-[0_18px_44px_-22px_rgb(0_0_0/0.35)] hover:border-foreground/20',
            )}
          >
            <form
              id={`${a.id}-form`}
              action={helper ? routes.becomeAHelper() : routes.app.newTask()}
              method="get"
              role={helper ? undefined : 'search'}
              aria-label={helper ? t('helperLabel') : t('label')}
              onSubmit={a.forget}
              className="flex items-start gap-2 py-2 pr-2 pl-5"
            >
              <Sparkles aria-hidden="true" data-paused={a.onScreen && !a.reduced ? undefined : ''} className="assistant-twinkle mt-[0.85rem] size-4 shrink-0 text-violet" />
              {/* The prompt slides away once there are words, open or folded, giving them the room (it stays the field's name). */}
              <label
                htmlFor={inputId}
                className={cn(
                  'mt-[0.55rem] shrink-0 overflow-hidden leading-6 whitespace-nowrap text-muted-foreground transition-[max-width,opacity,margin] duration-300 ease-[var(--ease-out)]',
                  // Room for the longest prompt ("Necesito ayuda para…"); it's only a cap, so shorter ones keep their width.
                  // Under 400 px it folds away (still the field's label), so the example has the row (audit M6).
                  a.text ? '-mr-2 max-w-0 opacity-0' : 'max-w-[11.5rem] opacity-100 max-[400px]:-mr-2 max-[400px]:max-w-0 max-[400px]:opacity-0',
                )}
              >
                {helper && <span className="sr-only">{t('helperLabel')}: </span>}
                {helper ? t('helperPrompt') : tHero('askPrompt')}
              </label>
              <div className="relative min-w-0 flex-1">
                {!a.text && !a.reduced && <TypewriterHint phrases={a.examples} active={a.typing} className="absolute inset-x-0 top-[0.55rem] block leading-6 text-foreground/45" />}
                <textarea
                  id={inputId}
                  name={helper ? undefined : 'describe'}
                  rows={1}
                  wrap={a.expanded ? 'soft' : 'off'}
                  value={a.text}
                  onChange={(event) => a.setText(event.target.value)}
                  onFocus={a.open}
                  onKeyDown={a.onKeyDown}
                  maxLength={LIMIT[a.mode]}
                  autoComplete="off"
                  placeholder={a.examples[0]}
                  aria-describedby={statusId}
                  aria-keyshortcuts="/"
                  className={cn(
                    'block w-full resize-none overflow-hidden bg-transparent py-[0.55rem] leading-6 font-medium text-foreground outline-none placeholder:font-normal placeholder:text-foreground/45',
                    !a.reduced && 'placeholder:text-transparent',
                    !a.expanded && 'whitespace-nowrap [mask-image:linear-gradient(to_right,#000_88%,transparent)]',
                  )}
                />
                {a.countLeft !== null && a.expanded && (
                  <p className={cn('pb-0.5 text-right text-xs tabular-nums', a.countLeft <= 10 ? 'text-warning' : 'text-muted-foreground')}>{t('charsLeft', { count: a.countLeft })}</p>
                )}
              </div>
              {!helper && a.category && <input type="hidden" name="category" value={a.category} />}
              {a.text && !a.speech.listening ? (
                <button type="button" onClick={a.clear} aria-label={t('clear')} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground active:scale-95">
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : (
                (a.speech.supported || a.speech.listening) && (
                  <button
                    type="button"
                    onClick={a.toggleVoice}
                    aria-pressed={a.speech.listening}
                    aria-label={a.speech.listening ? t('voiceStop') : t('voiceStart')}
                    className={cn(
                      'relative grid size-11 shrink-0 place-items-center rounded-full transition-colors active:scale-95',
                      a.speech.listening
                        ? 'assistant-listen text-violet after:absolute after:inset-1.5 after:rounded-full after:bg-violet/25 after:content-[""]'
                        : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
                    )}
                  >
                    {a.speech.listening ? <Square aria-hidden="true" className="relative size-3 fill-current" /> : <Mic aria-hidden="true" className="size-4" />}
                  </button>
                )
              )}
              {!a.text && !a.expanded && (
                <kbd aria-hidden="true" title={t('shortcut')} className="mt-[0.7rem] hidden h-6 min-w-6 shrink-0 place-items-center rounded-md border border-foreground/12 px-1.5 font-sans text-xs text-muted-foreground lg:grid">
                  /
                </kbd>
              )}
              <button
                type="submit"
                className="group/post inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_var(--primary-glow)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_16px_32px_-14px_var(--primary-glow)] active:translate-y-0 active:scale-[0.97] sm:px-5"
              >
                <span className="max-sm:sr-only">{helper ? t('helperSubmit') : tHero('primary')}</span>
                <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 group-hover/post:translate-x-0.5" />
              </button>
            </form>

            <p id={statusId} role="status" aria-live="polite" className="sr-only">
              {a.ai.status === 'thinking' ? t('aiThinking') : a.ai.status === 'done' ? t('aiDone') : a.typed && a.category ? (helper ? t('helperOpen', { count: a.matching, place: a.place }) : t('soundsLikeSpoken', { category: categoryName(a.category) })) : ''}
            </p>

            <AnimatePresence initial={false}>
              {a.expanded && (
                <m.div
                  key="panel"
                  ref={panelRef}
                  id={panelId}
                  role="region"
                  aria-label={helper ? t('helperPanelLabel') : t('panelLabel')}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: shownHeight, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={a.reduced ? { duration: 0 } : SPRING}
                  className="overflow-x-hidden overflow-y-auto overscroll-contain text-left [scrollbar-width:thin]"
                >
                  <div ref={measure} className="border-t border-foreground/[0.07] px-4 pt-3.5 pb-4">
                    <PanelBody a={a} />
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}

function PanelBody({ a }: { a: HeroAssistantModel }) {
  const t = useTranslations('landing.assistant');
  const categoryName = useTranslations('helperCard.categories');
  const helper = a.mode === 'helper';
  const showChooser = (a.typed && (!a.category || a.choosing)) || (helper && !a.typed);

  return (
    <>
      {a.speech.listening && (
        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-violet">
          <span aria-hidden="true" className="assistant-listen relative size-2 rounded-full bg-violet after:absolute after:inset-0 after:rounded-full after:bg-violet/40 after:content-['']" />
          {t('voiceListening')}
        </p>
      )}
      {a.speech.failed && !a.speech.listening && <p className="mb-3 text-xs text-muted-foreground">{t('voiceError')}</p>}

      {a.offer && !a.text && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-foreground/[0.04] py-1 pr-1 pl-3 text-sm">
          <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">{t('restoreTitle')}: </span>“{a.offer}”
          </span>
          <button type="button" onClick={a.restore} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-semibold text-primary transition-colors hover:bg-primary/[0.08]">
            {t('restore')}
          </button>
        </div>
      )}

      {!a.typed && !helper && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('examplesTitle')}</p>
          <ul className="mt-2.5 flex flex-wrap gap-2" onKeyDown={moveWithArrows}>
            {CATEGORY_SLUGS.map((slug, index) => {
              const Icon = CATEGORY_ICONS[slug];
              return (
                <li key={slug}>
                  <button
                    type="button"
                    onClick={() => {
                      a.setText(a.examples[index]!);
                      a.focusField();
                    }}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-foreground/10 px-3 text-sm transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-foreground/25 hover:bg-foreground/[0.04] active:translate-y-0"
                  >
                    <Icon aria-hidden="true" className="size-3.5" style={{ color: `var(--cat-${slug})` }} />
                    {a.examples[index]}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t('emptyHint')}</p>
        </div>
      )}

      {a.typed && a.intent.notOffered && !a.category && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl bg-foreground/[0.04] px-3 py-2.5 text-sm text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          {t(a.intent.notOffered === 'tv-mounting' ? 'notOffered.tvMounting' : 'notOffered.licensedTrade')}
        </p>
      )}

      {showChooser && (
        <div>
          <p className="text-sm font-medium">{helper ? t('helperPick') : a.category ? t('change') : t('pick')}</p>
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2" onKeyDown={moveWithArrows}>
            {CATEGORY_SLUGS.map((slug) => {
              const Icon = CATEGORY_ICONS[slug];
              return (
                <li key={slug}>
                  <button
                    type="button"
                    onClick={() => a.choose(slug)}
                    aria-pressed={a.category === slug}
                    className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-left text-sm transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05]', a.category === slug && 'bg-foreground/[0.06]')}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, var(--cat-${slug}) 16%, transparent)`, color: `var(--cat-${slug})` }}>
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>
                    {categoryName(slug)}
                  </button>
                </li>
              );
            })}
          </ul>
          {helper && !a.typed && <p className="mt-3 text-xs text-muted-foreground">{t('helperEmptyHint')}</p>}
        </div>
      )}

      {a.typed && a.category && a.view && !a.choosing && (helper ? <HelperReading a={a} category={a.category} view={a.view} /> : <PosterReading a={a} category={a.category} view={a.view} />)}

    </>
  );
}

function SoundsLike({ a, category }: { a: HeroAssistantModel; category: CategorySlug }) {
  const t = useTranslations('landing.assistant');
  const categoryName = useTranslations('helperCard.categories');
  const Icon = CATEGORY_ICONS[category];
  const level = confidenceLevel(a.intent.confidence);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-violet">
        <Sparkles aria-hidden="true" className="size-3.5" />
        {t('soundsLike')}
      </span>
      <button
        type="button"
        onClick={() => a.setChoosing(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 font-semibold transition-colors hover:bg-foreground/[0.04]"
        style={{ borderColor: `color-mix(in oklab, var(--cat-${category}) 40%, transparent)` }}
        aria-label={t('changeCategory', { category: categoryName(category) })}
      >
        <Icon aria-hidden="true" className="size-3.5" style={{ color: `var(--cat-${category})` }} />
        {categoryName(category)}
        <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </button>
      {/* How sure the instant reading is (not shown for a kind of help the visitor picked). */}
      {!a.picked && <ConfidenceBars level={level} label={t('confidence.label', { level: t(`confidence.${level}`) })} />}
    </div>
  );
}

function PosterReading({ a, category, view }: { a: HeroAssistantModel; category: CategorySlug; view: CategoryView }) {
  const t = useTranslations('landing.assistant');
  const tCategories = useTranslations('landing.categories');
  const details = useTranslations('postTask.details');
  const questions = CATEGORY_DETAIL_FIELDS[category].filter((field) => field.required).slice(0, 2);

  return (
    <div>
      <SoundsLike a={a} category={category} />
      {a.intent.title && a.ai.status !== 'done' && <p className="mt-3 font-display text-lg leading-snug font-semibold tracking-[-0.01em]">“{a.intent.title}”</p>}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{t('typical', { market: a.data.market.name })}</dt>
          <dd className="font-semibold tabular-nums">
            {tCategories('range', { low: formatMoney(view.priceGuidance.lowCents), high: formatMoney(view.priceGuidance.highCents) })} <span className="font-normal text-muted-foreground">{tCategories(`unit.${view.priceGuidance.unit}`)}</span>
          </dd>
        </div>
        {/* In-home work means checked helpers; remote work can be done from anywhere; outdoor work says neither. */}
        {(view.inHome || view.remoteAllowed) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            {view.inHome ? <BadgeCheck aria-hidden="true" className="size-4 text-success" /> : <Laptop aria-hidden="true" className="size-4 text-info" />}
            <dd>{view.inHome ? tCategories('inHome') : tCategories('remote')}</dd>
          </div>
        )}
        {questions.length > 0 && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <MessageCircleQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <dd>
              {t('helpersAsk')} {questions.map((field) => details(`${category}.${field.key}.label`)).join(' · ')}
            </dd>
          </div>
        )}
      </dl>

      {a.canWrite && <AiBlock a={a} />}

      <div className="sticky bottom-0 z-[1] -mx-4 -mb-4 mt-4 flex flex-wrap items-center border-t border-foreground/[0.06] bg-card px-4 pt-3 pb-4 gap-x-3 gap-y-2">
        {a.ai.status === 'done' && a.draftHref && (
          <Link
            href={a.draftHref}
            onClick={a.forget}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_var(--primary-glow)] transition-[transform,background-color] hover:bg-primary-hover active:scale-[0.97]"
          >
            {t('aiUse')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
        <Link
          href={a.continueHref}
          onClick={a.forget}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[transform,background-color,border-color] active:scale-[0.97]',
            a.ai.status === 'done' ? 'border border-foreground/12 hover:border-foreground/25 hover:bg-foreground/[0.03]' : 'bg-primary text-primary-foreground shadow-[0_12px_28px_-14px_var(--primary-glow)] hover:bg-primary-hover',
          )}
        >
          {t('continue')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {/* Without the page's own AI (previews, or it's off), the wizard can still draft after sign-in. */}
        {!a.canWrite && a.wizardAiHref && (
          <Link
            href={a.wizardAiHref}
            onClick={a.forget}
            aria-describedby={`${a.id}-ai-hint`}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-violet/30 px-4 text-sm font-semibold text-violet transition-colors hover:border-violet/60 hover:bg-violet/[0.06]"
          >
            <WandSparkles aria-hidden="true" className="size-4" />
            {t('aiDraft')}
          </Link>
        )}
      </div>
      {!a.canWrite && a.wizardAiHref && <p id={`${a.id}-ai-hint`} className="mt-2 text-xs text-muted-foreground">{t('aiDraftHint')}</p>}
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden="true" className="size-3.5" />
        {t('reassure')}
      </p>
    </div>
  );
}

function AiBlock({ a }: { a: HeroAssistantModel }) {
  const t = useTranslations('landing.assistant');
  const ai = a.ai;
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-violet/20 bg-violet/[0.04] p-3" aria-busy={ai.status === 'thinking'}>
      {ai.status === 'idle' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={() => void a.writeWithAi()}
            className="group/ai inline-flex min-h-11 items-center gap-2 rounded-full border border-violet/35 bg-card px-4 text-sm font-semibold text-violet shadow-[0_10px_24px_-16px_var(--violet)] transition-[transform,background-color,box-shadow] hover:-translate-y-px hover:bg-violet/[0.06] hover:shadow-[0_14px_28px_-16px_var(--violet)] active:translate-y-0 active:scale-[0.97]"
          >
            <WandSparkles aria-hidden="true" className="size-4 transition-transform duration-500 group-hover/ai:rotate-12" />
            {t('aiWrite')}
          </button>
          <p className="min-w-0 flex-1 basis-52 text-xs text-muted-foreground">{t('aiWriteHint')}</p>
        </div>
      )}
      {ai.status === 'thinking' && (
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet">
            <Sparkles aria-hidden="true" className="assistant-twinkle size-3.5" />
            {t('aiThinking')}
          </p>
          <div aria-hidden="true" className="mt-2.5 space-y-2">
            <div className="assistant-shimmer h-4 w-3/5 rounded-md" />
            <div className="assistant-shimmer h-3 w-full rounded-md" />
            <div className="assistant-shimmer h-3 w-4/5 rounded-md" />
          </div>
        </div>
      )}
      {ai.status === 'done' && <AiDraftCard a={a} draft={ai.draft} />}
      {ai.status === 'error' && (
        <div className="text-sm">
          <p className="font-medium">{t(`aiErrors.${ai.code}`)}</p>
          {(ai.code === 'unavailable' || ai.code === 'rate_limited') && a.wizardAiHref && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('aiFallback')}{' '}
              <Link href={a.wizardAiHref} onClick={a.forget} className="font-semibold text-violet underline-offset-4 hover:underline">
                {t('aiDraft')}
              </Link>
            </p>
          )}
          {ai.code === 'too_short' && (
            <button type="button" onClick={a.focusField} className="mt-1 min-h-9 text-xs font-semibold text-violet underline-offset-4 hover:underline">
              {t('aiKeep')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AiDraftCard({ a, draft }: { a: HeroAssistantModel; draft: LandingAiDraft }) {
  const t = useTranslations('landing.assistant');
  const title = useReveal(draft.title, a.reduced);
  const description = useReveal(draft.description, a.reduced);
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-violet">
        <Sparkles aria-hidden="true" className="size-3.5" />
        {t('aiNote')}
      </p>
      {/* Shown as it's written out; read whole by screen readers. */}
      <p aria-hidden="true" className="mt-2 font-display text-base leading-snug font-semibold tracking-[-0.01em]">{title}</p>
      <p aria-hidden="true" className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{description}</p>
      <div className="sr-only">
        <p>{draft.title}</p>
        <p>{draft.description}</p>
      </div>
      {/* "Use this draft" is the panel's main action, pinned at its foot (always in view). */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void a.writeWithAi()} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-violet transition-colors hover:bg-violet/[0.06]">
          {t('aiAgain')}
        </button>
        <button type="button" onClick={a.keepWords} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground">
          {t('aiKeep')}
        </button>
      </div>
    </div>
  );
}

function HelperReading({ a, category, view }: { a: HeroAssistantModel; category: CategorySlug; view: CategoryView }) {
  const t = useTranslations('landing.assistant');
  const tCategories = useTranslations('landing.categories');
  return (
    <div>
      <SoundsLike a={a} category={category} />
      <p className="mt-3 font-display text-lg leading-snug font-semibold tracking-[-0.01em]">{t('helperOpen', { count: a.matching, place: a.place })}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="text-muted-foreground">{t('helperTypical')}</span>
        <span className="font-semibold tabular-nums">
          {tCategories('range', { low: formatMoney(view.priceGuidance.lowCents), high: formatMoney(view.priceGuidance.highCents) })} <span className="font-normal text-muted-foreground">{tCategories(`unit.${view.priceGuidance.unit}`)}</span>
        </span>
      </p>
      <RewardBadge reward={a.data.welcomeReward} className="mt-3" />
      <div className="sticky bottom-0 z-[1] -mx-4 -mb-4 mt-4 flex flex-wrap items-center border-t border-foreground/[0.06] bg-card px-4 pt-3 pb-4 gap-2">
        <Link
          href={routes.becomeAHelper()}
          onClick={a.forget}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_var(--primary-glow)] transition-[transform,background-color] hover:bg-primary-hover active:scale-[0.97]"
        >
          {t('helperBecome')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {a.matching > 0 && (
          <button type="button" onClick={a.seeTasks} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/12 px-4 text-sm font-semibold transition-colors hover:border-foreground/25 hover:bg-foreground/[0.03]">
            <MapPinned aria-hidden="true" className="size-4" />
            {t('helperSee')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The assistant folded to one line, in place of the hero's line of new tasks (same height, so nothing moves): the
 * kind of help and its typical price (or the matching open tasks, for helpers), a click to open it again, and the
 * next step. With an AI draft written, it says so and goes on with the draft.
 */
export function AssistantSummary({ assistant: a, className }: { assistant: HeroAssistantModel; className?: string }) {
  const t = useTranslations('landing.assistant');
  const tCategories = useTranslations('landing.categories');
  const categoryName = useTranslations('helperCard.categories');
  const helper = a.mode === 'helper';
  const view = a.view;
  const detail = !a.category || !view
    ? null
    : helper
      ? t('summaryHelperOpen', { count: a.matching })
      : tCategories('range', { low: formatMoney(view.priceGuidance.lowCents), high: formatMoney(view.priceGuidance.highCents) });
  const aiReady = a.ai.status === 'done' && a.draftHref;
  const next = aiReady ? a.draftHref! : a.continueHref;

  return (
    <div className={cn('flex h-9 min-w-0 items-center gap-1 text-sm', className)}>
      <button
        type="button"
        onClick={a.expand}
        aria-expanded={false}
        aria-label={t('summaryExpand', { text: a.trimmed })}
        className="group/sum flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full pr-2 text-left text-muted-foreground"
      >
        <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-violet" />
        {aiReady ? (
          <span className="truncate font-medium text-violet group-hover/sum:underline">{t('summaryAiReady')}</span>
        ) : a.category ? (
          <>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: `var(--cat-${a.category})` }} />
            <span className="shrink-0 font-medium text-foreground group-hover/sum:underline">{categoryName(a.category)}</span>
            {detail && <span className="hidden min-w-0 truncate tabular-nums sm:inline">· {detail}</span>}
          </>
        ) : (
          <span className="truncate">
            “{a.trimmed}” · <span className="font-medium text-foreground group-hover/sum:underline">{t('summaryPick')}</span>
          </span>
        )}
      </button>
      <Link href={next} onClick={a.forget} className="group/next inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-1 font-semibold text-primary">
        {helper ? t('helperSubmit') : aiReady ? t('aiUse') : t('summaryContinue')}
        <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-300 group-hover/next:translate-x-0.5" />
      </Link>
    </div>
  );
}
