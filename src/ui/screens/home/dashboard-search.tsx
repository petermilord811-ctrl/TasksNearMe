'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Search, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AI_SEARCH_TEXT_MAX, DASHBOARD_KEYWORD_MAX, routes, type AiSearchResult, type DashboardData, type DashboardHandlers } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { Button } from '@/ui/primitives/button';
import { AiAnswer, type AiAnswerState } from './ai-answer';
import { dashboardBase } from './links';

/**
 * The dashboard's search (completion plan 9.9). Search finds the words in the person's own tasks, offers and bookings
 * and in open tasks nearby, through the URL (`q`), so it works without AI and without JavaScript. Where the plan
 * allows AI search (`data.aiSearch`), Ask AI sends the same words to `onAiSearch` and shows what it found under the
 * field; with `needs_plan` or `monthly_limit` a line links to the plan, and with `ai_off` there's only Search.
 */
export function DashboardSearch({ data, onAiSearch, initialAnswer }: { data: DashboardData; onAiSearch?: DashboardHandlers['onAiSearch']; /** Previews: an answer already on screen. */ initialAnswer?: AiAnswerState }) {
  const t = useTranslations('home.search');
  const router = useRouter();
  const { formatDate } = useFormat();
  const { query, aiSearch, mode } = data;
  const canAsk = aiSearch.allowed && Boolean(onAiSearch);
  const [text, setText] = useState(query.q ?? initialAnswer?.text ?? '');
  // The field follows the URL's words when they change by navigation (back, a tab, Clear search).
  const [shownQ, setShownQ] = useState(query.q);
  if (shownQ !== query.q) {
    setShownQ(query.q);
    setText(query.q ?? '');
  }
  const [answer, setAnswer] = useState<AiAnswerState | null>(initialAnswer ?? null);
  const [remaining, setRemaining] = useState(aiSearch.remaining);
  const asking = useRef(false);
  const pending = answer?.status === 'pending';

  async function ask() {
    if (!onAiSearch || asking.current) return;
    const words = text.trim();
    if (words.length < 3) {
      setAnswer({ status: 'done', text: words, result: { ok: false, code: 'too_short' } });
      return;
    }
    asking.current = true;
    setAnswer({ status: 'pending', text: words });
    let result: AiSearchResult;
    try {
      result = await onAiSearch({ text: words });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    asking.current = false;
    if (result.ok) setRemaining(result.remaining);
    setAnswer({ status: 'done', text: words, result });
  }

  // The other filters ride along, so a search keeps the list as it is (defaults stay out of the URL).
  const keep: [string, string][] = [
    ['tab', query.tab],
    ...(query.view !== 'list' ? [['view', query.view] as [string, string]] : []),
    ...(query.status !== 'active' ? [['status', query.status] as [string, string]] : []),
    ...(query.date !== 'any' ? [['date', query.date] as [string, string]] : []),
    ...(query.category ? [['category', query.category] as [string, string]] : []),
  ];
  const blocked = !aiSearch.allowed && (aiSearch.reason === 'needs_plan' || aiSearch.reason === 'monthly_limit') ? aiSearch.reason : null;

  return <div className="space-y-3">
    {/* A plain GET form, so Search works before the page's scripts load; after that it stays on the page. */}
    <form action={routes.app.home()} method="get" role="search" aria-label={t(`label.${mode}`)} className="rounded-[1.375rem] border bg-card p-1.5 shadow-card sm:p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const words = text.replace(/\s+/g, ' ').trim().slice(0, DASHBOARD_KEYWORD_MAX);
        router.push(routes.app.home({ ...dashboardBase(query), q: words || undefined }), { scroll: false });
      }}>
      {keep.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="home-search" className="sr-only">{t(`label.${mode}`)}</label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="home-search"
            name="q"
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={canAsk ? AI_SEARCH_TEXT_MAX : DASHBOARD_KEYWORD_MAX}
            placeholder={t(canAsk ? `placeholder.${mode}` : `placeholderPlain.${mode}`)}
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 w-full min-w-0 rounded-2xl border border-transparent bg-muted pr-12 pl-11 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 sm:pr-3 [&::-webkit-search-cancel-button]:hidden"
          />
          <Button type="submit" progressive variant="ghost" size="icon" aria-label={t('submit')} className="absolute top-1/2 right-1 size-10 min-h-10 min-w-10 -translate-y-1/2 rounded-xl text-primary sm:hidden">
            <ArrowRight aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <Button type="submit" progressive variant="outline" className="hidden h-12 px-5 sm:inline-flex">{t('submit')}</Button>
        {canAsk && <Button type="button" onClick={() => void ask()} disabled={pending} aria-busy={pending} className="h-12 px-5">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" />}
          <span className="sm:hidden">{t('aiLong')}</span><span className="hidden sm:inline">{t('ai')}</span>
        </Button>}
      </div>
    </form>
    {(query.q || (canAsk && remaining !== null) || blocked) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground">
      {query.q && <Link href={routes.app.home({ tab: query.tab, view: query.view, status: query.status, date: query.date, ...(query.category ? { category: query.category } : {}) })} scroll={false} onClick={() => setText('')} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
        <X aria-hidden="true" className="size-4" />{t('clear')}
      </Link>}
      {canAsk && remaining !== null && <span className="tabular-nums">{aiSearch.resetsAt ? t('remainingRenews', { count: remaining, date: formatDate(aiSearch.resetsAt) }) : t('remaining', { count: remaining })}</span>}
      {blocked && <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-primary" />
        {blocked === 'needs_plan' ? t('needsPlan') : aiSearch.resetsAt ? t('monthlyLimitRenews', { date: formatDate(aiSearch.resetsAt) }) : t('monthlyLimit')}
        <Link href={routes.app.plan()} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">{t('seePlans')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </span>}
    </div>}
    {answer && <AiAnswer state={answer} onClose={() => setAnswer(null)} />}
  </div>;
}
