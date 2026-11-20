'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BellRing, Lock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type FindWorkCard, type FindWorkHandlers, type FindWorkPageData, type FindWorkWaiting, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { BotCheckField, useBotCheck } from '@/ui/components/forms/bot-check';
import { FinishSetupPanel } from '@/ui/components/helper/finish-setup-panel';
import { WaitingForCityNote } from '@/ui/components/helper/waiting-for-city';
import { PageHeader } from '@/ui/components/layout/page-header';
import { AreaMap, type AreaMapPlace } from '@/ui/components/map/area-map';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';
import { FindWorkFilters } from './find-work-filters';
import { FindWorkRow, isFoldedCard, useBudgetLabel } from './find-work-row';

export interface FindWorkScreenProps {
  data: FindWorkPageData;
  now: ISODateTime;
  /** Save and hide (absent: the rows show no buttons). */
  handlers?: FindWorkHandlers;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
}

/** Why a one-tap offer didn't go through (each has its own words). */
const QUICK_OFFER_ERRORS = ['not_allowed', 'limit_reached', 'rate_limited', 'not_found', 'unknown', 'undo_failed', 'bot_check'] as const;
type QuickOfferError = (typeof QUICK_OFFER_ERRORS)[number];

/**
 * The latest choice for each key (a task's save or hide), sent one request at a time. A tap while a request
 * is on its way (Undo right after "Not interested") is sent once it's back, never dropped.
 */
class LatestChoice {
  private readonly wanted = new Map<string, boolean>();
  private readonly sending = new Set<string>();
  private readonly onBusy: (key: string, busy: boolean) => void;

  constructor(onBusy: (key: string, busy: boolean) => void) {
    this.onBusy = onBusy;
  }

  /** Resolves with the value that failed, if one did. */
  async send(key: string, value: boolean, request: (value: boolean) => Promise<{ ok: boolean }>): Promise<{ failed?: boolean }> {
    this.wanted.set(key, value);
    if (this.sending.has(key)) return {};
    this.sending.add(key);
    this.onBusy(key, true);
    let sent: boolean | undefined;
    try {
      while (this.wanted.get(key) !== sent) {
        sent = this.wanted.get(key)!;
        const result = await request(sent).catch(() => ({ ok: false }));
        if (!result.ok) return { failed: sent };
      }
      return {};
    } finally {
      this.sending.delete(key);
      this.onBusy(key, false);
    }
  }
}

/** "2026-11-21" as a date at midday in Austin, for labels. */
const dayAt = (day: string) => `${day}T18:00:00.000Z`;

function useDayLabel(today: string) {
  const { formatDate } = useFormat();
  const t = useTranslations('findWork');
  const tomorrow = new Date(Date.parse(dayAt(today)) + 86_400_000).toISOString().slice(0, 10);
  return (day: string) => (day === today ? t('days.today') : day === tomorrow ? t('days.tomorrow') : formatDate(dayAt(day)));
}

/**
 * Find work (UI-050): open tasks near the helper as a comfortable list (days as groups, compact rows with
 * the pay, the area and the time) beside a map of their general areas (never an address). On phones a
 * switch shows the list or the map; on wide screens both, and hovering a row lights its area. A helper whose
 * city we're not in yet sees that instead (completion plan 8.4).
 */
export function FindWorkScreen(props: FindWorkScreenProps) {
  return props.data.waitingFor ? <WaitingForCity data={props.data} waiting={props.data.waitingFor} /> : <FindWorkList {...props} />;
}

/**
 * "We're not in {city} yet" (completion plan 8.4): a helper who gave a ZIP no open market covers has no tasks to
 * find (their home market is only a placeholder). Who else is waiting near them, the waitlist for their ZIP, and
 * their setup to finish meanwhile, so they're ready the day the city opens.
 */
function WaitingForCity({ data, waiting }: { data: FindWorkPageData; waiting: FindWorkWaiting }) {
  const page = useTranslations('findWork');
  const t = useTranslations('findWork.waiting');
  return <div className="mx-auto w-full max-w-content space-y-4">
    <PageHeader title={page('title')} description={page('description')} />
    <WaitingForCityNote waiting={waiting} />
    {data.setup.bookable
      ? <p className="text-sm text-muted-foreground">{t('ready', { city: waiting.city })}</p>
      : <FinishSetupPanel setup={data.setup} title={t('setupTitle')} body={t('setupBody', { city: waiting.city })} />}
  </div>;
}

function FindWorkList({ data, now, handlers, liveMap = true }: FindWorkScreenProps) {
  // One bot check for the list's one-tap offers (contracts/bot-check.ts).
  const check = useBotCheck(data.botCheck, 'offer');
  const t = useTranslations('findWork');
  const savedSearches = useTranslations('savedSearches');
  const budgetLabel = useBudgetLabel();
  const dayLabel = useDayLabel(data.today);
  const { query } = data;
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<FindWorkCard | null>(null);
  // Hidden rows and where they were, so Undo can put them back before the list comes back with them.
  const [kept, setKept] = useState<Record<string, { card: FindWorkCard; index: number }>>({});
  // Save and hide requests on their way (`save:<taskId>`, `hide:<taskId>`), and the latest choice for each.
  const [pending, setPending] = useState<Record<string, true>>({});
  const [choices] = useState(() => new LatestChoice((key, busy) => setPending(({ [key]: _was, ...rest }) => (busy ? { ...rest, [key]: true as const } : rest))));
  const [failed, setFailed] = useState(false);
  // The one-tap offer: per row while it's sent (and "sent" until the list refreshes), then a notice with Undo.
  const [offerStates, setOfferStates] = useState<Record<string, 'sending' | 'sent'>>({});
  const [offered, setOffered] = useState<{ card: FindWorkCard; undone?: boolean } | null>(null);
  const [offerError, setOfferError] = useState<QuickOfferError | null>(null);

  // A row hidden and brought back by Undo stays in its place until the list has it again.
  const listed = useMemo(() => {
    const out = [...data.cards];
    for (const { card, index } of Object.values(kept)) {
      if (hidden[card.task.id] === false && !out.some((each) => each.task.id === card.task.id)) out.splice(Math.min(index, out.length), 0, card);
    }
    return out;
  }, [data.cards, kept, hidden]);
  // Rows the list has again no longer need keeping.
  const [listedCards, setListedCards] = useState(data.cards);
  if (listedCards !== data.cards) {
    setListedCards(data.cards);
    const back = Object.keys(kept).filter((id) => data.cards.some((card) => card.task.id === id));
    if (back.length > 0) setKept(Object.fromEntries(Object.entries(kept).filter(([id]) => !back.includes(id))));
  }
  const cards = listed.filter((card) => !hidden[card.task.id] && !(query.saved && saved[card.task.id] === false));
  const isSaved = (card: FindWorkCard) => saved[card.task.id] ?? card.saved;
  const places: AreaMapPlace[] = useMemo(() => cards.flatMap((card) => card.task.location.kind === 'local'
    ? [{ id: card.task.id, point: card.task.location.publicPoint, radiusMeters: card.task.location.radiusMeters, label: budgetLabel(card), name: t('mapPlace', { title: card.task.title, budget: budgetLabel(card), area: card.task.location.areaName }) }]
    : []), [cards, budgetLabel, t]);
  const remoteCount = cards.filter((card) => card.task.location.kind === 'remote').length;

  // Days as groups when the list goes by start time.
  const groups: { day: string | null; cards: FindWorkCard[] }[] = [];
  for (const card of cards) {
    const day = query.sort === 'soonest' ? card.startDay : null;
    const last = groups.at(-1);
    if (last && last.day === day) last.cards.push(card);
    else groups.push({ day, cards: [card] });
  }
  // Tasks the helper can't take fold to one line at the end of their group (audit M22), the rest in their order.
  for (const group of groups) group.cards.sort((a, b) => Number(isFoldedCard(a)) - Number(isFoldedCard(b)));

  async function toggleSave(card: FindWorkCard) {
    if (!handlers) return;
    const next = !isSaved(card);
    setSaved((current) => ({ ...current, [card.task.id]: next }));
    setFailed(false);
    const { failed: value } = await choices.send(`save:${card.task.id}`, next, (saved) => handlers.onSaveTask({ taskId: card.task.id, saved }));
    if (value !== undefined) { setSaved((current) => ({ ...current, [card.task.id]: !value })); setFailed(true); }
  }

  async function hide(card: FindWorkCard, value: boolean) {
    if (!handlers) return;
    const id = card.task.id;
    setHidden((current) => ({ ...current, [id]: value }));
    // Undo puts the row back where it was, even when the list already came back without it.
    if (value) setKept((current) => ({ ...current, [id]: { card, index: Math.max(0, data.cards.findIndex((each) => each.task.id === id)) } }));
    setUndo(value ? card : null);
    setFailed(false);
    const { failed } = await choices.send(`hide:${id}`, value, (hidden) => handlers.onHideTask({ taskId: id, hidden }));
    if (failed !== undefined) { setHidden((current) => ({ ...current, [id]: !failed })); setUndo(null); setFailed(true); }
  }

  async function quickOffer(card: FindWorkCard) {
    if (!handlers?.onQuickOffer || offerStates[card.task.id]) return;
    setOfferStates((current) => ({ ...current, [card.task.id]: 'sending' }));
    setOfferError(null);
    setOffered(null);
    const result: ActionResult = await handlers.onQuickOffer({ taskId: card.task.id, ...(check.token ? { botCheck: check.token } : {}) }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
    // Each answer works once: the next tap gets a fresh one.
    check.reset();
    if (!result.ok && result.fieldErrors?.botCheck) {
      setOfferStates(({ [card.task.id]: _gone, ...rest }) => rest);
      setOfferError('bot_check');
      return;
    }
    if (result.ok) {
      setOfferStates((current) => ({ ...current, [card.task.id]: 'sent' }));
      setOffered({ card });
      return;
    }
    setOfferStates(({ [card.task.id]: _gone, ...rest }) => rest);
    setOfferError(QUICK_OFFER_ERRORS.includes(result.code as QuickOfferError) ? (result.code as QuickOfferError) : 'unknown');
  }

  async function undoQuickOffer(card: FindWorkCard) {
    if (!handlers?.onUndoQuickOffer) return;
    const result = await handlers.onUndoQuickOffer({ taskId: card.task.id }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
    if (result.ok) {
      setOfferStates(({ [card.task.id]: _gone, ...rest }) => rest);
      setOffered({ card, undone: true });
    } else setOfferError('undo_failed');
  }

  const selectedCard = selected ? cards.find((card) => card.task.id === selected) : undefined;
  const mapArea = data.map.area;

  return <div className="mx-auto w-full max-w-content space-y-4">
    <PageHeader title={t('title')} description={t('description')}>
      {/* Save these filters, with alerts when a new task fits (completion plan 7.10, sweep SS5); not the saved-tasks view. */}
      {!query.saved && <Link href={routes.app.newSavedSearch(routes.app.findWork({ ...query, page: undefined, view: undefined, saved: undefined, sort: undefined }))} rel="nofollow" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-foreground/[0.1] bg-card px-4 text-sm font-semibold hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.1]"><BellRing aria-hidden="true" className="size-4 text-primary" />{savedSearches('save')}</Link>}
    </PageHeader>
    {!data.setup.bookable && <FinishSetupPanel setup={data.setup} />}
    <FindWorkFilters data={data} />
    <div aria-live="polite" className="empty:hidden">
      {undo && <p className="flex flex-wrap items-center justify-between gap-2 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 text-sm shadow-card dark:border-white/[0.06]">
        <span>{t('hiddenNotice', { title: undo.task.title })}</span>
        <button type="button" onClick={() => void hide(undo, false)} className="inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4">{t('undoHide')}</button>
      </p>}
      {offered && <p className="flex flex-wrap items-center justify-between gap-2 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 text-sm shadow-card dark:border-white/[0.06]">
        <span>{offered.undone ? t('quickOfferUndone', { title: offered.card.task.title }) : t('quickOfferNotice', { price: offered.card.quickOffer ? formatMoney(offered.card.quickOffer.priceCents) : '', title: offered.card.task.title })}</span>
        {!offered.undone && handlers?.onUndoQuickOffer && <button type="button" onClick={() => void undoQuickOffer(offered.card)} className="inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4">{t('quickOfferUndo')}</button>}
      </p>}
      {offerError && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t(`quickOfferErrors.${offerError}`)}</p>}
      {data.botCheck && handlers?.onQuickOffer && <BotCheckField check={check} />}
      {failed && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t('markFailed')}</p>}
    </div>
    <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section aria-label={t('resultsLabel')} className={cn('min-w-0 space-y-4', query.view === 'map' && 'hidden lg:block')}>
        <p className="font-semibold tabular-nums">{t(query.saved ? 'savedResults' : 'results', { count: data.totalCount })}</p>
        {cards.length === 0 ? <EmptyState title={t(query.saved ? 'savedEmptyTitle' : 'emptyTitle')} body={t(query.saved ? 'savedEmptyBody' : 'emptyBody')} action={{ label: t('clearFilters'), href: routes.app.findWork() }} />
          : groups.map((group, index) => <section key={`${group.day ?? 'all'}-${index}`} aria-labelledby={group.day ? `day-${group.day}` : undefined} className="space-y-2">
            {group.day && <h2 id={`day-${group.day}`} className="text-sm font-semibold text-muted-foreground">{dayLabel(group.day)}</h2>}
            <ul className="space-y-2">{group.cards.map((card) => <li key={card.task.id} className="min-w-0">
              <FindWorkRow card={card} now={now} active={active === card.task.id || selected === card.task.id} onActiveChange={setActive} saved={isSaved(card)} pending={Boolean(pending[`save:${card.task.id}`] || pending[`hide:${card.task.id}`])} onToggleSave={handlers ? () => void toggleSave(card) : undefined} onHide={handlers ? () => void hide(card, true) : undefined} onQuickOffer={handlers?.onQuickOffer ? () => void quickOffer(card) : undefined} offerState={offerStates[card.task.id]} />
            </li>)}</ul>
          </section>)}
        {data.pageCount > 1 && <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {query.page > 1 && <Link href={routes.app.findWork({ ...query, page: query.page - 1 })} rel="prev" className={buttonVariants({ variant: 'outline' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('previous')}</Link>}
          <p className="text-sm tabular-nums">{t('page', { page: query.page, count: data.pageCount })}</p>
          {query.page < data.pageCount && <Link href={routes.app.findWork({ ...query, page: query.page + 1 })} rel="next" className={buttonVariants({ variant: 'outline' })}>{t('next')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        </nav>}
      </section>
      <aside aria-label={t('mapLabel')} className={cn('min-w-0', query.view === 'map' ? 'block' : 'hidden lg:block')}>
        <div className="space-y-2 lg:sticky lg:top-[calc(var(--app-header-offset,0px)+7.5rem)]">
          <AreaMap
            styleUrl={data.map.styleUrl}
            attribution={data.map.attribution}
            places={places}
            serviceArea={mapArea ? { center: mapArea.center, radiusMiles: mapArea.serviceRadiusMiles } : undefined}
            fallbackCenter={data.map.marketCenter}
            activeId={active ?? selected}
            onActiveChange={setActive}
            onSelect={setSelected}
            label={t('mapLabel')}
            groupLabel={(count) => t('mapGroup', { count })}
            live={liveMap}
            className="h-[62vh] min-h-80 lg:h-[calc(100vh-var(--app-header-offset,0px)-10rem)]"
          />
          <p className="text-xs text-muted-foreground">{mapArea ? t('mapLegend', { area: mapArea.name, miles: mapArea.serviceRadiusMiles }) : t('mapLegendNoArea')}{remoteCount > 0 ? ` ${t('mapRemote', { count: remoteCount })}` : ''}</p>
          {selectedCard && <div className="relative rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 pr-12 shadow-card dark:border-white/[0.06]">
            <p className="font-semibold"><Link href={routes.app.findWorkTask(selectedCard.task.id)} className="underline-offset-4 hover:underline">{selectedCard.task.title}</Link></p>
            <p className="text-sm text-muted-foreground tabular-nums">{selectedCard.task.location.kind === 'local' ? selectedCard.task.location.areaName : ''} · {budgetLabel(selectedCard)}{selectedCard.earnings.type === 'fixed' ? ` · ${t('earn', { amount: formatMoney(selectedCard.earnings.amountCents) })}` : ''}</p>
            <button type="button" onClick={() => setSelected(null)} aria-label={t('closeSelected')} className="absolute top-1.5 right-1.5 inline-flex size-11 items-center justify-center rounded-md hover:bg-accent"><X aria-hidden="true" className="size-4" /></button>
          </div>}
        </div>
      </aside>
    </div>
    <p className="flex items-start gap-2 border-t pt-6 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
  </div>;
}

/** The helper home shows the same card context under its suggestions. */
export { FindWorkCardContext } from "./find-work-row";
