'use client';

import { useTranslations } from 'next-intl';
import type { ISODateTime } from '@/contracts';
import { useLastVisit } from '@/ui/lib/last-visit';

/**
 * "New since your last visit" on a post's replies (completion plan 7.6, Reddit-style), from this browser's memory
 * of the reader's last look at the post (src/ui/lib/last-visit.ts). Never for your own replies, and nothing on a
 * first visit, when everything would be new.
 */
const isNew = (lastVisit: number | null | undefined, at: ISODateTime, own: boolean) => !own && typeof lastVisit === 'number' && Date.parse(at) > lastVisit;

/** "New" beside a reply posted since the last visit. */
export function NewSinceVisit({ at, visitKey, own = false }: { at: ISODateTime; visitKey: string; own?: boolean }) {
  const t = useTranslations('community.sinceVisit');
  const lastVisit = useLastVisit(visitKey);
  if (!isNew(lastVisit, at, own)) return null;
  return <span title={t('title')} className="inline-flex items-center rounded-full bg-badge-brand px-1.5 py-px text-[11px] font-semibold text-badge-brand-foreground">{t('badge')}</span>;
}

/**
 * "2 new since your last visit" beside the reply count. Always rendered, so opening a post with no replies yet
 * still counts as a visit.
 */
export function RepliesSinceVisit({ visitKey, replies }: { visitKey: string; replies: { at: ISODateTime; own: boolean }[] }) {
  const t = useTranslations('community.sinceVisit');
  const lastVisit = useLastVisit(visitKey);
  const count = replies.filter((reply) => isNew(lastVisit, reply.at, reply.own)).length;
  if (count === 0) return null;
  return <span className="ml-2 text-sm font-medium text-primary">{t('count', { count })}</span>;
}
