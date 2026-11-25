'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListChecks, Sparkles } from 'lucide-react';
import { aiAssistOutcome, type AiAssistOutcome, type AiAssistResult, type BookingChecklist, type BookingPrepHandlers, type BookingPrepView } from '@/contracts';
import { AiDraftButton } from '@/ui/components/forms/ai-draft';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { sectionTitle, surface, surfacePad } from './surface';

/** Preview seeds: making a checklist now, or why the last try didn't work. */
export interface BookingPrepPreview {
  pending?: boolean;
  failed?: Exclude<AiAssistOutcome, 'drafted'>;
  /** Items ticked on this device. */
  done?: string[];
}

function readTicks(key: string): string[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * "Get ready" on a booking (2026-11-24): the viewer's checklist for the day, made with AI from what was agreed when they
 * ask, and kept for them. Ticks stay on this device only. A booking that changed since offers a fresh one; nothing here
 * is sent to the other person.
 */
export function BookingPrepCard({ bookingId, role, otherName, prep, handlers, preview }: {
  bookingId: string;
  role: 'poster' | 'helper';
  /** The other person's first name. */
  otherName: string;
  prep: BookingPrepView;
  /** "Make my checklist"; without it the checklist shows without the button. */
  handlers?: BookingPrepHandlers;
  preview?: BookingPrepPreview;
}) {
  const t = useTranslations('bookingHub.prep');
  const { formatDate } = useFormat();
  const id = useId();
  const [checklist, setChecklist] = useState<BookingChecklist | undefined>(prep.checklist);
  const [stale, setStale] = useState(Boolean(prep.stale));
  const [pending, setPending] = useState(preview?.pending ?? false);
  const [failed, setFailed] = useState<BookingPrepPreview['failed']>(preview?.failed);
  const storageKey = `tasksnearme:prep:${bookingId}:${role}`;
  const [done, setDone] = useState<string[]>(preview?.done ?? []);

  // Ticks kept on this device come back once it's hydrated (the device's storage exists only then).
  useEffect(() => {
    if (preview?.done) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's storage exists only after hydration
    setDone(readTicks(storageKey));
  }, [storageKey, preview?.done]);

  const toggle = (item: string) => {
    setDone((current) => {
      const next = current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // No storage (a private window): ticks last for this visit.
      }
      return next;
    });
  };

  async function make() {
    if (!handlers || pending) return;
    setPending(true);
    setFailed(undefined);
    let result: AiAssistResult<BookingChecklist>;
    try {
      result = await handlers.onPrepare({});
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    setPending(false);
    if (!result.ok) {
      const outcome = aiAssistOutcome(result);
      setFailed(outcome === 'drafted' ? 'unavailable' : outcome);
      return;
    }
    setChecklist(result.value);
    setStale(false);
  }

  const items = checklist?.items ?? [];
  const ticked = items.filter((item) => done.includes(item)).length;
  return <section aria-labelledby={`${id}-title`} data-booking-prep className={cn(surface, surfacePad, 'space-y-4')}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><ListChecks className="size-5" /></span>
      <div className="min-w-0 space-y-1">
        <h2 id={`${id}-title`} className={sectionTitle}>{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t(role === 'poster' ? 'introPoster' : 'introHelper', { name: otherName })}</p>
      </div>
    </div>

    {checklist && <div className="space-y-3">
      <ul aria-label={t('list')} className="space-y-1.5">
        {items.map((item, index) => {
          const checked = done.includes(item);
          return <li key={`${index}-${item}`}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
              <input type="checkbox" checked={checked} onChange={() => toggle(item)} className="mt-0.5 size-5 shrink-0 accent-primary" />
              <span className={cn('min-w-0 break-words', checked && 'text-muted-foreground line-through')}>{item}</span>
            </label>
          </li>;
        })}
      </ul>
      <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{t('progress', { done: ticked, total: items.length })}</p>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{t('madeWithAi', { date: formatDate(checklist.madeAt) })}</span></p>
    </div>}

    {stale && <p className="rounded-xl border border-warning/40 bg-warning/[0.08] px-3 py-2 text-sm">{t('stale')}</p>}

    {handlers && <AiDraftButton pending={pending} onClick={() => void make()} pendingLabel={t('making')} variant={checklist && !stale ? 'ghost' : 'outline'} size={checklist && !stale ? 'sm' : undefined} className="rounded-full">
      {t(checklist ? 'again' : 'make')}
    </AiDraftButton>}
    <div aria-live="polite">{failed && <p className="text-sm text-destructive">{t(`errors.${failed}`)}</p>}</div>
  </section>;
}
