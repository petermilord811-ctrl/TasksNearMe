'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Lock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type FindWorkCard, type FindWorkHandlers, type FindWorkPageData, type ISODateTime } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { FinishSetupPanel } from '@/ui/components/helper/finish-setup-panel';
import { PageHeader } from '@/ui/components/layout/page-header';
import { AreaMap, type AreaMapPlace } from '@/ui/components/map/area-map';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';
import { FindWorkFilters } from './find-work-filters';
import { FindWorkRow, useBudgetLabel } from './find-work-row';

export interface FindWorkScreenProps {
  data: FindWorkPageData;
  now: ISODateTime;
  /** Save and hide (absent: the rows show no buttons). */
  handlers?: FindWorkHandlers;
  /** Previews and tests: the drawn map only. */
  liveMap?: boolean;
}

/** Why a one-tap offer didn't go through (each has its own words). */
const QUICK_OFFER_ERRORS = ['not_allowed', 'limit_reached', 'rate_limited', 'not_found', 'unknown', 'undo_failed'] as const;
type QuickOfferError = (typeof QUICK_OFFER_ERRORS)[number];

/** "2026-11-21" as a date at midday in Austin, for labels. */
const dayAt = (day: string) => `${day}T18:00:00.000Z`;

function useDayLabel(today: string) {
  const t = useTranslations('findWork');
  const tomorrow = new Date(Date.parse(dayAt(today)) + 86_400_000).toISOString().slice(0, 10);
  return (day: string) => (day === today ? t('days.today') : day === tomorrow ? t('days.tomorrow') : formatDate(dayAt(day)));
}

/**
 * Find work (UI-050): open tasks near the helper as a comfortable list (days as groups, compact rows with
 * the pay, the area and the time) beside a map of their general areas (never an address). On phones a
 * switch shows the list or the map; on wide screens both, and hovering a row lights its area.
 */
export function FindWorkScreen({ data, now, handlers, liveMap = true }: FindWorkScreenProps) {
  const t = useTranslations('findWork');
  const budgetLabel = useBudgetLabel();
  const dayLabel = useDayLabel(data.today);
  const { query } = data;
  const [active, setActive] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<FindWorkCard | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // The one-tap offer: per row while it's sent (and "sent" until the list refreshes), then a notice with Undo.
  const [offerStates, setOfferStates] = useState<Record<string, 'sending' | 'sent'>>({});
  const [offered, setOffered] = useState<{ card: FindWorkCard; undone?: boolean } | null>(null);
  const [offerError, setOfferError] = useState<QuickOfferError | null>(null);

  const cards = data.cards.filter((card) => !hidden[card.task.id] && !(query.saved && saved[card.task.id] === false));
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

  async function toggleSave(card: FindWorkCard) {
    if (!handlers || pending) return;
    const next = !isSaved(card);
    setSaved((current) => ({ ...current, [card.task.id]: next }));
    setPending(card.task.id);
    setFailed(false);
    const result = await handlers.onSaveTask({ taskId: card.task.id, saved: next }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
    setPending(null);
    if (!result.ok) { setSaved((current) => ({ ...current, [card.task.id]: !next })); setFailed(true); }
  }

  async function hide(card: FindWorkCard, value: boolean) {
    if (!handlers || pending) return;
    setHidden((current) => ({ ...current, [card.task.id]: value }));
    setUndo(value ? card : null);
    setPending(card.task.id);
    setFailed(false);
    const result = await handlers.onHideTask({ taskId: card.task.id, hidden: value }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
    setPending(null);
    if (!result.ok) { setHidden((current) => ({ ...current, [card.task.id]: !value })); setUndo(null); setFailed(true); }
  }

  async function quickOffer(card: FindWorkCard) {
    if (!handlers?.onQuickOffer || offerStates[card.task.id]) return;
    setOfferStates((current) => ({ ...current, [card.task.id]: 'sending' }));
    setOfferError(null);
    setOffered(null);
    const result = await handlers.onQuickOffer({ taskId: card.task.id }).catch(() => ({ ok: false as const, code: 'unknown' as const }));
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
    <PageHeader title={t('title')} description={t('description')} />
    {!data.setup.bookable && <FinishSetupPanel setup={data.setup} />}
    <FindWorkFilters data={data} />
    <div aria-live="polite" className="empty:hidden">
      {undo && <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm shadow-card">
        <span>{t('hiddenNotice', { title: undo.task.title })}</span>
        <button type="button" onClick={() => void hide(undo, false)} className="inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4">{t('undoHide')}</button>
      </p>}
      {offered && <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm shadow-card">
        <span>{offered.undone ? t('quickOfferUndone', { title: offered.card.task.title }) : t('quickOfferNotice', { price: offered.card.quickOffer ? formatMoney(offered.card.quickOffer.priceCents) : '', title: offered.card.task.title })}</span>
        {!offered.undone && handlers?.onUndoQuickOffer && <button type="button" onClick={() => void undoQuickOffer(offered.card)} className="inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary underline underline-offset-4">{t('quickOfferUndo')}</button>}
      </p>}
      {offerError && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t(`quickOfferErrors.${offerError}`)}</p>}
      {failed && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{t('markFailed')}</p>}
    </div>
    <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section aria-label={t('resultsLabel')} className={cn('min-w-0 space-y-4', query.view === 'map' && 'hidden lg:block')}>
        <p className="font-semibold tabular-nums">{t(query.saved ? 'savedResults' : 'results', { count: data.totalCount })}</p>
        {cards.length === 0 ? <EmptyState title={t(query.saved ? 'savedEmptyTitle' : 'emptyTitle')} body={t(query.saved ? 'savedEmptyBody' : 'emptyBody')} action={{ label: t('clearFilters'), href: routes.app.findWork() }} />
          : groups.map((group, index) => <section key={`${group.day ?? 'all'}-${index}`} aria-labelledby={group.day ? `day-${group.day}` : undefined} className="space-y-2">
            {group.day && <h2 id={`day-${group.day}`} className="text-sm font-semibold text-muted-foreground">{dayLabel(group.day)}</h2>}
            <ul className="space-y-2">{group.cards.map((card) => <li key={card.task.id} className="min-w-0">
              <FindWorkRow card={card} now={now} active={active === card.task.id || selected === card.task.id} onActiveChange={setActive} saved={isSaved(card)} pending={pending === card.task.id} onToggleSave={handlers ? () => void toggleSave(card) : undefined} onHide={handlers ? () => void hide(card, true) : undefined} onQuickOffer={handlers?.onQuickOffer ? () => void quickOffer(card) : undefined} offerState={offerStates[card.task.id]} />
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
          {selectedCard && <div className="relative rounded-xl border bg-card p-3 pr-12 shadow-card">
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
