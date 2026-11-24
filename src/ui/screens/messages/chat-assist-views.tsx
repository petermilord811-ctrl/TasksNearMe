'use client';

import { useTranslations } from 'next-intl';
import { Languages, RotateCcw, Sparkles, X } from 'lucide-react';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { useChatAssist, type AutoTranslation, type CatchUpState } from './chat-assist';

/** "Translate this conversation" and "Catch me up" as the conversation shows them (2026-11-24; state: `chat-assist.tsx`). */

/** Above the messages while the conversation is translated: whose and into what, and the way to turn it off. */
export function TranslatingBar({ name, compact = false }: { name: string; compact?: boolean }) {
  const t = useTranslations('thread.translateAll');
  const assist = useChatAssist();
  if (!assist?.translating) return null;
  return <div className={cn('flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-foreground/[0.07] bg-brand-soft/40 text-muted-foreground dark:border-white/[0.06]', compact ? 'px-2.5 py-1 text-[11px] leading-4' : 'px-4 py-1.5 text-xs')}>
    <Languages aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
    <p role="status" className="min-w-0 flex-1">{assist.paused ? t('paused') : t('on', { name, language: assist.language })}</p>
    {assist.paused && <button type="button" onClick={assist.retry} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"><RotateCcw aria-hidden="true" className="size-3.5" />{t('retry')}</button>}
    <button type="button" onClick={() => assist.setTranslating(false)} className="inline-flex min-h-8 items-center rounded-full px-2 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring">{t('off')}</button>
  </div>;
}

/** Under a translated message: "Translated · Show original" (or back), "Translating…", or that it wasn't. */
export function TranslationNote({ messageId, translation }: { messageId: string; translation: AutoTranslation }) {
  const t = useTranslations('thread');
  const assist = useChatAssist();
  if (!assist || translation.status === 'same') return null;
  if (translation.status === 'loading') return <p aria-busy="true" className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Spinner aria-hidden="true" className="size-3" />{t('translateAll.translating')}</p>;
  if (translation.status === 'error') return <p className="text-[11px] text-muted-foreground">{t('translateAll.notTranslated')}</p>;
  const original = assist.originals.has(messageId);
  return <p className="flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
    <Languages aria-hidden="true" className="size-3" />
    {!original && <span>{t('translate.label')}</span>}
    {!original && <span aria-hidden="true">·</span>}
    <button type="button" aria-pressed={original} onClick={() => assist.toggleOriginal(messageId)} className="-my-1 inline-flex min-h-7 items-center rounded-full px-1 font-semibold text-foreground/80 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      {original ? t('translateAll.showTranslation') : t('translate.original')}
    </button>
  </p>;
}

/**
 * "Catch me up" as a card in the conversation: offered (many unread), reading, the summary with what it covers and that it
 * may be wrong, or that it failed. Dismissed, it's gone until asked again from the ⋯ menu.
 */
export function CatchUpCard({ state, name, compact = false, onAsk, onDismiss }: {
  state: Exclude<CatchUpState, { status: 'idle' }>;
  /** The other person's first name. */
  name: string;
  compact?: boolean;
  onAsk(): void;
  onDismiss(): void;
}) {
  const t = useTranslations('thread.catchUp');
  const { formatDate, formatDateTime, formatTime, dayKey } = useFormat();
  const busy = state.status === 'loading';
  let range: string | undefined;
  if (state.status === 'ready') {
    const { count, from, to } = state.summary;
    range = dayKey(from) === dayKey(to)
      ? t('rangeDay', { count, day: formatDate(from), from: formatTime(from), to: formatTime(to) })
      : t('range', { count, from: formatDateTime(from), to: formatDateTime(to) });
  }
  return <section data-catch-up={state.status} aria-label={t('label')} aria-busy={busy} className={cn('relative mx-auto w-full max-w-[36rem] rounded-2xl border border-primary/20 bg-brand-soft/60 text-left shadow-[0_1px_2px_rgb(23_18_14/0.05)] dark:border-primary/30', compact ? 'px-3 py-2.5 text-[13px] leading-5' : 'px-4 py-3 text-sm leading-6')}>
    <div className="flex items-start gap-2 pr-8">
      <Sparkles aria-hidden="true" className={cn('shrink-0 text-primary', compact ? 'mt-0.5 size-3.5' : 'mt-1 size-4')} />
      <h3 className="font-semibold text-foreground">{state.status === 'ready' ? t('readyTitle') : t('title')}</h3>
    </div>
    <button type="button" onClick={onDismiss} aria-label={t('dismiss')} title={t('dismiss')} className="absolute top-1 right-1 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <X aria-hidden="true" className="size-4" />
    </button>
    <div aria-live="polite" className="mt-1 space-y-2">
      {state.status === 'offered' && <>
        <p className="text-muted-foreground">{t('offer', { count: state.unread, name })}</p>
        <Button type="button" size="sm" onClick={onAsk} className="min-h-9 rounded-full"><Sparkles aria-hidden="true" />{t('ask')}</Button>
      </>}
      {state.status === 'loading' && <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner aria-hidden="true" className="size-4" />{t('loading')}</p>}
      {state.status === 'ready' && <>
        <ul className="list-disc space-y-1 pl-5 marker:text-primary/70">
          {state.summary.points.map((point, index) => <li key={index}>{point}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground"><span className="font-semibold">{t('disclaimer')}</span>{range && <> · {range}</>}</p>
      </>}
      {state.status === 'failed' && <>
        <p role="alert" className="text-destructive">{t('failed')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onAsk} className="min-h-9 rounded-full"><RotateCcw aria-hidden="true" />{t('retry')}</Button>
      </>}
    </div>
  </section>;
}
