'use client';

import { useState, useTransition } from 'react';
import { House, Lightbulb, MessageCircleQuestion, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionHandler, type NeighborsWelcomeView } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { HelperItem } from './portal-rail';

/**
 * "Welcome to Mueller" (2026-11-24): once per move, for the person who moved or just joined. The place's best-rated
 * helpers, its most helpful tips, and a question to ask (the new-post dialog). "Got it" closes it on every device; it
 * says so while it saves and stays if that fails. Helper names and tips open over the page (the peek, the post dialog).
 */
export function NeighborsWelcomeCard({ welcome, onDismiss }: { welcome: NeighborsWelcomeView; onDismiss?: ActionHandler<{ id: string }> }) {
  const t = useTranslations('portal.welcome');
  const [closed, setClosed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (closed) return null;
  const headingId = `welcome-${welcome.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const empty = welcome.helpers.length === 0 && welcome.tips.length === 0;
  return <section aria-labelledby={headingId} aria-busy={pending} className="space-y-4 rounded-2xl border border-primary/25 bg-[linear-gradient(135deg,var(--color-brand-soft),var(--color-card)_70%)] p-4 shadow-card sm:p-5">
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase"><House aria-hidden="true" className="size-3.5" />{t('eyebrow')}</p>
      <h2 id={headingId} className="font-display text-lg/7 font-semibold tracking-[-0.015em] [overflow-wrap:anywhere] sm:text-xl/7">{t('title', { place: welcome.placeName })}</h2>
      <p className="text-[14px]/[1.5] text-foreground/90">{empty ? t('empty', { place: welcome.placeName }) : t('intro')}</p>
    </div>
    {welcome.helpers.length > 0 && <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('helpers')}</h3>
      <ul className="grid gap-2.5 sm:grid-cols-2">{welcome.helpers.map((helper) => <li key={helper.handle} className="min-w-0"><HelperItem helper={helper} layout="tile" /></li>)}</ul>
    </div>}
    {welcome.tips.length > 0 && <div className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('tips')}</h3>
      <ul className="space-y-1">{welcome.tips.map((tip) => <li key={tip.id}>
        <Link href={routes.app.communityPost(tip.id)} className="-mx-2 flex min-w-0 items-start gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-ring">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sun" />
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm font-medium [overflow-wrap:anywhere]">{tip.title}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums"><ThumbsUp aria-hidden="true" className="size-3 text-primary" />{t('helpful', { count: tip.helpfulCount })}</span>
              {tip.areaName && <><span aria-hidden="true">·</span><span>{tip.areaName}</span></>}
            </span>
          </span>
        </Link>
      </li>)}</ul>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <Link href={routes.app.newCommunityPost('question')} className={cn(buttonVariants({ size: 'sm' }), 'min-h-10 rounded-full px-4')}><MessageCircleQuestion aria-hidden="true" />{t('ask')}</Link>
      {onDismiss && <Button type="button" variant="ghost" size="sm" disabled={pending} aria-busy={pending} className="min-h-10 rounded-full" onClick={() => startTransition(async () => {
        setFailed(false);
        const result = await onDismiss({ id: welcome.id }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
        if (result.ok) setClosed(true);
        else setFailed(true);
      })}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'dismissing' : 'dismiss')}</Button>}
    </div>
    <p role="alert" className="text-sm text-destructive empty:hidden">{failed ? t('failed') : ''}</p>
  </section>;
}
