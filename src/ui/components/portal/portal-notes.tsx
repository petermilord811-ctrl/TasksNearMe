'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { House, Megaphone, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionHandler, CommunityAnnouncementView, CommunityAreaInput, PortalArea } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * The card staff pinned to the top of Neighbors (plan 10.16): a welcome at launch, a holiday note. Closing it keeps it
 * closed on every device.
 */
export function AnnouncementCard({ announcement, onDismiss }: { announcement: CommunityAnnouncementView; onDismiss?: ActionHandler<{ id: string }> }) {
  const t = useTranslations('portal.announcement');
  const [closed, setClosed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (closed) return null;
  return <section aria-labelledby={`announcement-${announcement.id}`} className="relative overflow-hidden rounded-2xl border border-primary/25 bg-brand-soft/60 p-3.5 pr-11 sm:p-4 sm:pr-12">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase"><Megaphone aria-hidden="true" className="size-3.5" />{t('eyebrow')}</p>
    <h2 id={`announcement-${announcement.id}`} className="mt-0.5 font-display text-[15.5px]/6 font-semibold [overflow-wrap:anywhere]">{announcement.title}</h2>
    <p className="mt-0.5 whitespace-pre-line text-[14px]/[1.45] text-foreground/90 [overflow-wrap:anywhere]">{announcement.body}</p>
    {onDismiss && <button
      type="button"
      disabled={pending}
      aria-label={t('dismiss')}
      onClick={() => startTransition(async () => {
        setClosed(true);
        const result = await onDismiss({ id: announcement.id }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
        if (!result.ok) setClosed(false);
      })}
      className="absolute top-2 right-2 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    ><X aria-hidden="true" className="size-4" /></button>}
  </section>;
}

const NOT_NOW_KEY = 'tnm:neighbors:ask-area-later';

/**
 * "Which neighborhood are you in?" (plan 10.15): asked above the stream while we don't know it, so "Near you" means
 * something from a member's first visit. The neighborhood only, never an address. "Not now" waits until the next
 * visit (this tab's session).
 */
export function AskAreaCard({ areas, marketName, onSetArea }: { areas: PortalArea[]; marketName: string; onSetArea: ActionHandler<CommunityAreaInput> }) {
  const t = useTranslations('portal.askArea');
  const id = useId();
  const [slug, setSlug] = useState('');
  const [later, setLater] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this tab's storage after hydration
      if (window.sessionStorage.getItem(NOT_NOW_KEY) === '1') setLater(true);
    } catch {
      // No storage: ask each time.
    }
  }, []);
  if (later) return null;
  const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name));
  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-card p-3.5 shadow-card sm:p-4">
    <h2 id={`${id}-title`} className="flex items-center gap-2 font-display text-[15.5px]/6 font-semibold"><House aria-hidden="true" className="size-4.5 text-primary" />{t('title')}</h2>
    <p className="mt-0.5 text-[13px] text-muted-foreground">{t('body', { market: marketName })}</p>
    <form className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(event) => {
      event.preventDefault();
      if (!slug || pending) return;
      startTransition(async () => {
        const result = await onSetArea({ areaSlug: slug }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
        if (result.ok) toast.success(t('saved'));
        else toast.error(t('failed'));
      });
    }}>
      <label htmlFor={`${id}-area`} className="sr-only">{t('label')}</label>
      <select id={`${id}-area`} value={slug} onChange={(event) => setSlug(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base sm:text-sm">
        <option value="">{t('choose')}</option>
        {sorted.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="submit" disabled={!slug || pending} aria-busy={pending} className="flex-1 sm:flex-none">{pending && <Spinner aria-hidden="true" />}{t('save')}</Button>
        <Button type="button" variant="ghost" onClick={() => { try { window.sessionStorage.setItem(NOT_NOW_KEY, '1'); } catch { /* no storage */ } setLater(true); }}>{t('later')}</Button>
      </div>
    </form>
    <p className="mt-1.5 text-xs text-muted-foreground">{t('privacy')}</p>
  </section>;
}

/**
 * Staff in production (plan 10, D1): members don't see the demo marketplace on Neighbors; staff can switch it on for
 * themselves to check how a busy neighborhood looks.
 */
export function SamplesNote({ shown, onShowSamples }: { shown: boolean; onShowSamples?: ActionHandler<{ shown: boolean }> }) {
  const t = useTranslations('portal.samples');
  const [pending, startTransition] = useTransition();
  return <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
    <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
    <span className="min-w-0 flex-1">{t(shown ? 'shown' : 'hidden')}</span>
    {onShowSamples && <button type="button" disabled={pending} onClick={() => startTransition(async () => { await onShowSamples({ shown: !shown }); })} className="min-h-8 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">{t(shown ? 'hide' : 'show')}</button>}
  </p>;
}

/**
 * Your neighborhood, changeable (plan 10.15): under the neighborhoods' list (the strip's More, the phone's place sheet),
 * the one "Near you" starts from and a way to change it. The neighborhood only, never an address.
 */
export function YourAreaControl({ areas, yourArea, onSetArea }: { areas: PortalArea[]; yourArea?: { slug: string; name: string }; onSetArea: ActionHandler<CommunityAreaInput> }) {
  const t = useTranslations('portal.yourArea');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(yourArea?.slug ?? '');
  const [pending, startTransition] = useTransition();
  const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name));
  return <div className="space-y-2 border-t border-border/70 px-2.5 pt-3">
    <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="min-w-0"><span className="text-muted-foreground">{t('label')}</span> <span className="font-semibold">{yourArea?.name ?? t('none')}</span></span>
      {!open && <button type="button" onClick={() => setOpen(true)} className="min-h-8 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t(yourArea ? 'change' : 'set')}</button>}
    </p>
    {open && <form className="flex gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (!slug || pending) return;
      startTransition(async () => {
        const result = await onSetArea({ areaSlug: slug }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
        if (result.ok) { toast.success(t('saved')); setOpen(false); } else toast.error(t('failed'));
      });
    }}>
      <label htmlFor={`${id}-area`} className="sr-only">{t('label')}</label>
      <select id={`${id}-area`} value={slug} onChange={(event) => setSlug(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-2.5 text-base sm:text-sm">
        <option value="">{t('choose')}</option>
        {sorted.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}
      </select>
      <Button type="submit" size="sm" disabled={!slug || pending} aria-busy={pending} className="min-h-10">{pending && <Spinner aria-hidden="true" />}{t('save')}</Button>
    </form>}
  </div>;
}
