import Link from 'next/link';
import { ArrowRight, BadgeCheck, FilePenLine, MapPin, Sparkles, Star, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AiSearchAnswer, type AiSearchResult, type HelperSummary } from '@/contracts';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { buttonVariants } from '@/ui/primitives/button';
import { DashboardRows } from './dashboard-item';
import { seeAllHref } from './links';

/** Where the AI answer stands: asked and waiting, or answered (an answer, or why not). */
export type AiAnswerState = { status: 'pending'; text: string } | { status: 'done'; text: string; result: AiSearchResult };

const ERROR_CODES = ['too_short', 'ai_off', 'needs_plan', 'daily_limit', 'monthly_limit', 'prohibited', 'rate_limited', 'unavailable'] as const;

function Understood({ answer }: { answer: AiSearchAnswer }) {
  const t = useTranslations('home.ai');
  const category = useTranslations('helperCard.categories');
  const { understood } = answer;
  const chips = [
    understood.category ? category(understood.category) : t('anyCategory'),
    ...(understood.when ? [t(`when.${understood.when}`)] : []),
    ...(understood.area ? [t('near', { area: understood.area.name })] : []),
  ];
  return <p className="flex flex-wrap items-center gap-1.5 text-sm">
    <span className="text-muted-foreground">{t('lookingFor')}</span>
    {chips.map((chip) => <span key={chip} className="rounded-full border border-primary/25 bg-card px-2.5 py-0.5 font-medium">{chip}</span>)}
  </p>;
}

function HelperLine({ helper }: { helper: HelperSummary }) {
  const t = useTranslations('home.ai.helpers');
  return <li className="relative flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/70 has-[a:focus-visible]:bg-muted/70">
    <InitialsAvatar initials={helper.initials} size="sm" {...(helper.photo ? { photo: helper.photo } : {})} />
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 font-semibold">
        <Link href={routes.helperProfile(helper.handle)} className="truncate outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:text-primary focus-visible:underline">{helper.displayName}</Link>
        {helper.badges.idVerifiedAt && <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground tabular-nums">
        {helper.rating && <span className="inline-flex items-center gap-0.5"><Star aria-hidden="true" className="size-3.5 fill-current text-reward" />{helper.rating.average.toFixed(1)}</span>}
        <span>{t('jobs', { count: helper.completedCount })}</span>
        <span className="inline-flex items-center gap-0.5"><MapPin aria-hidden="true" className="size-3.5" />{helper.areaName}</span>
      </p>
    </div>
    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
  </li>;
}

function Answer({ answer }: { answer: AiSearchAnswer }) {
  const t = useTranslations('home.ai');
  const getHelp = answer.understood.intent === 'get_help';
  const tasksTitle = <h3 className="text-sm font-semibold">{t(`tasks.${answer.understood.intent}`)}</h3>;
  const tasks = <div className="min-w-0 space-y-2">
    {tasksTitle}
    {answer.tasks.length > 0 ? <DashboardRows items={answer.tasks} headingLevel={4} /> : <p className="text-sm text-muted-foreground">{t('tasks.empty')}</p>}
    {answer.tasksLink && <Link href={seeAllHref(answer.tasksLink)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
      {t(answer.tasksLink.kind === 'find_work' ? 'tasks.seeAllFindWork' : 'tasks.seeAllBoard')}<ArrowRight aria-hidden="true" className="size-4" />
    </Link>}
  </div>;
  if (!getHelp) return tasks;
  return <div className="grid gap-4 md:grid-cols-2">
    {answer.draft && <div className="flex flex-col gap-3 rounded-2xl border bg-background/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><FilePenLine aria-hidden="true" className="size-4 text-primary" />{t('draft.title')}</h3>
      <p className="font-display text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{answer.draft.title}</p>
      <p className="text-sm text-muted-foreground">{t('draft.body')}</p>
      <Link href={routes.app.newTask({ category: answer.draft.category, title: answer.draft.title, describe: answer.draft.describe })} className={buttonVariants({ className: 'mt-auto self-start' })}>
        {t('draft.action')}<ArrowRight aria-hidden="true" />
      </Link>
    </div>}
    <div className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">{t('helpers.title')}</h3>
      {answer.helpers.length > 0
        ? <ul className="-mx-2 space-y-0.5">{answer.helpers.map((helper) => <HelperLine key={helper.id} helper={helper} />)}</ul>
        : <p className="text-sm text-muted-foreground">{t('helpers.empty')}</p>}
      {answer.helpersQuery && answer.helpers.length > 0 && <Link href={routes.app.helpers(answer.helpersQuery)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {t('helpers.seeAll')}<ArrowRight aria-hidden="true" className="size-4" />
      </Link>}
    </div>
    {answer.tasks.length > 0 && <div className="md:col-span-2">{tasks}</div>}
  </div>;
}

/**
 * What AI search found ("describe what you need", completion plan 9.9): what it understood, then for someone who needs
 * help a task to post and helpers who do this, and for a helper the open tasks that match. Every row is a real one the
 * app found with AI's filters. While it reads, a quiet placeholder; when it can't answer, why, and the way on.
 */
export function AiAnswer({ state, onClose }: { state: AiAnswerState; onClose: () => void }) {
  const t = useTranslations('home.ai');
  const search = useTranslations('home.search');
  const result = state.status === 'done' ? state.result : null;
  const error = result && !result.ok && (ERROR_CODES as readonly string[]).includes(result.code) ? result.code : result && !result.ok ? 'unavailable' : null;
  return <section aria-labelledby="home-ai-answer" aria-busy={state.status === 'pending'} className="overflow-hidden rounded-[1.375rem] border border-primary/20 bg-card shadow-card">
    <header className="flex items-start gap-3 border-b border-primary/15 bg-brand-soft px-4 py-3">
      <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-card"><Sparkles className="size-4" /></span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <h2 id="home-ai-answer" className="font-display text-base leading-6 font-semibold">{t('title')}</h2>
        {result?.ok && <Understood answer={result.answer} />}
      </div>
      <button type="button" onClick={onClose} aria-label={t('close')} className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"><X aria-hidden="true" className="size-4" /></button>
    </header>
    <div aria-live="polite" className="p-4">
      {state.status === 'pending' && <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />{t('searching')}</p>
        <div aria-hidden="true" className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((index) => <div key={index} className="space-y-2.5 rounded-2xl border p-4"><div className="h-3 w-1/3 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><div className="h-4 w-4/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><div className="h-3 w-2/3 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /></div>)}
        </div>
      </div>}
      {error && <div className="space-y-2" role="alert">
        <p className="text-sm font-medium">{t(`errors.${error}`)}</p>
        {error === 'prohibited' && <Link href={routes.legal('prohibited-tasks')} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('prohibitedLink')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        {(error === 'needs_plan' || error === 'daily_limit' || error === 'monthly_limit') && <Link href={routes.app.plan()} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{search('seePlans')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
      </div>}
      {result?.ok && <Answer answer={result.answer} />}
    </div>
    {result?.ok && <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{t('disclaimer')}</p>}
  </section>;
}
