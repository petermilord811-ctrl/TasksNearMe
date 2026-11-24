'use client';

import { useState } from 'react';
import { ArrowRight, HelpCircle, Lightbulb, Plus, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CategorySlug } from '@/contracts';
import { routes } from '@/contracts/routes';
import { readTaskIntent } from '@/shared/task-intent';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';

const WORDS_MAX = 300;

/**
 * The board's composer (owner, 2026-11-23: the open tasks "Craigslist style but … smoothly integrated with NextDoor post
 * feature"): one line, as on Neighbors, that turns into a task to post with the words (the category it sounds like, a
 * title), and beside it the Neighbors posts people make before hiring: ask for a recommendation, ask a question, share
 * a tip. Signing in comes first where a post needs it; a task can be drafted signed out (/post).
 */
export function BoardComposer({ market, category }: { market: string; category?: CategorySlug }) {
  const t = useTranslations('taskBoard.composer');
  const card = useTranslations('taskCard');
  const locale = useLocale();
  const [text, setText] = useState('');
  const words = text.replace(/\s+/g, ' ').trim();
  const intent = words.length >= 3 ? readTaskIntent(words) : null;
  const guess = intent?.category ?? category;
  const kinds = [
    { kind: 'recommendation', Icon: ThumbsUp },
    { kind: 'question', Icon: HelpCircle },
    { kind: 'tip', Icon: Lightbulb },
  ] as const;
  return <section aria-labelledby="board-composer" className="overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
    {/* A plain GET form to the posting wizard (it reads `describe`, `title` and `category`), so it works before the page
        hydrates; signed out, the wizard opens at /post with the same words. */}
    <form action={localeHref(routes.app.newTask(), locale)} method="get" className="flex items-center gap-3 p-3 sm:p-4">
      {intent?.title && <input type="hidden" name="title" value={intent.title} />}
      {guess && <input type="hidden" name="category" value={guess} />}
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm max-sm:hidden"><Plus className="size-5" /></span>
      <h2 id="board-composer" className="sr-only">{t('title', { market })}</h2>
      <label htmlFor="board-composer-words" className="sr-only">{t('label')}</label>
      <input id="board-composer-words" name="describe" value={text} onChange={(event) => setText(event.target.value)} maxLength={WORDS_MAX} placeholder={t('placeholder', { market })} autoComplete="off" enterKeyHint="send"
        className="h-11 min-w-0 flex-1 text-ellipsis rounded-full border border-foreground/[0.1] bg-background/70 px-4 text-base outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:text-[0.9375rem] dark:border-white/[0.1]" />
      <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.03] max-sm:px-3">
        <span className="max-sm:sr-only">{t('post')}</span><ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
    {intent?.category && <p className="-mt-1 px-4 pb-2 text-[13px] text-muted-foreground sm:pl-[4.25rem]" aria-live="polite">{t('soundsLike', { category: card(`categories.${intent.category}`) })}</p>}
    {/* From `sm`: on phones the composer is its one line (2026-11-24), so the first task shows on the first screen; the
        Neighbors tab and "From your neighbors" lead to these posts there. */}
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-foreground/[0.06] px-2 py-1.5 max-sm:hidden sm:px-3 dark:border-white/[0.06]">
      <span className="px-2 text-[13px] text-muted-foreground">{t('orAsk')}</span>
      {kinds.map(({ kind, Icon }) => <Link key={kind} href={routes.app.newCommunityPost(kind)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-accent hover:text-foreground">
        <Icon aria-hidden="true" className="size-4 text-primary" />{t(`kinds.${kind}`)}
      </Link>)}
    </div>
  </section>;
}
