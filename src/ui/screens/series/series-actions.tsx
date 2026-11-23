'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarX, CirclePause, CirclePlay, CreditCard, MessageCircle, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { pauseSeriesInputSchema, routes, type ActionResult, type SeriesActionId, type SeriesHandlers, type SeriesPageData } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PaymentMethodLabel, UnusableCardOption, useCardRemoval } from '@/ui/components/payments';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/primitives/sheet';
import { Spinner } from '@/ui/primitives/spinner';
import { AddCardForm } from '@/ui/screens/money/add-card-form';
import { useSeriesMutation } from './use-series-mutation';

const icons: Record<SeriesActionId, typeof CirclePause> = {
  pause_series: CirclePause,
  resume_series: CirclePlay,
  change_card: CreditCard,
  cancel_series: CalendarX,
  end_series: CalendarX,
  message: MessageCircle,
};

/** A market date ("2026-12-21") as a day to read ("Mon, Dec 21"). */
// Noon UTC: the same calendar day in every US market, to format the day itself.
const dayOf = (date: string) => `${date}T18:00:00.000Z`;

/** One modal at every width: a bottom sheet on phones, a centered panel from `sm` up. */
function SeriesSheet({ title, description, open, onOpenChange, locked, children }: { title: string; description: string; open: boolean; onOpenChange: (open: boolean) => void; locked: boolean; children: ReactNode }) {
  const t = useTranslations('series');
  const change = (next: boolean) => { if (!locked) onOpenChange(next); };
  return <Sheet open={open} onOpenChange={change}>
    <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] gap-0 pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:border" onEscapeKeyDown={(event) => { if (locked) event.preventDefault(); }} onInteractOutside={(event) => { if (locked) event.preventDefault(); }}>
      <SheetHeader className="shrink-0 p-4 sm:p-6"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">{children}</div>
      <div className="shrink-0 border-t border-foreground/[0.07] p-4 sm:px-6"><Button type="button" variant="outline" disabled={locked} className="w-full" onClick={() => change(false)}>{t('goBack')}</Button></div>
    </SheetContent>
  </Sheet>;
}

/** What went wrong, in the page's words: "this changed" for a stale page (with Reload), the shared copy otherwise. */
export function SeriesFeedback({ result, onReload }: { result?: ActionResult; onReload: () => void }) {
  const t = useTranslations('series');
  if (!result || result.ok) return <div aria-live="polite" />;
  if (result.code === 'not_allowed') {
    return <div aria-live="polite"><div role="status" className="space-y-3 rounded-2xl border border-warning/40 bg-badge-warning/60 p-4">
      <p>{t('changed')}</p>
      <Button type="button" variant="outline" onClick={onReload}><RotateCcw aria-hidden="true" />{t('reload')}</Button>
    </div></div>;
  }
  return <FormFeedback result={result} />;
}

function PauseSheet({ limits, open, onOpenChange, onPause }: { limits: NonNullable<SeriesPageData['pauseLimits']>; open: boolean; onOpenChange: (open: boolean) => void; onPause: SeriesHandlers['onPause'] }) {
  const t = useTranslations('series');
  const { formatDate } = useFormat();
  const id = useId();
  const mutation = useSeriesMutation();
  const [resumeOn, setResumeOn] = useState('');
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const range = { first: formatDate(dayOf(limits.firstDate)), last: formatDate(dayOf(limits.lastDate)) };
  const serverInvalid = mutation.result && !mutation.result.ok && Boolean(mutation.result.fieldErrors?.resumeOn?.length);
  const showError = invalid || serverInvalid;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = pauseSeriesInputSchema.safeParse({ resumeOn });
    if (!parsed.success || resumeOn < limits.firstDate || resumeOn > limits.lastDate) {
      setInvalid(true);
      input.current?.focus();
      return;
    }
    setInvalid(false);
    const next = await mutation.run('pause', () => onPause(parsed.data), t('pause.success'));
    if (next?.ok) onOpenChange(false);
  }

  return <SeriesSheet title={t('pause.title')} description={t('pause.description')} open={open} onOpenChange={onOpenChange} locked={mutation.pending !== null}>
    <form noValidate aria-busy={mutation.pending !== null} onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`${id}-date`} className="block font-medium">{t('pause.date')}</label>
        <Input
          ref={input}
          id={`${id}-date`}
          type="date"
          min={limits.firstDate}
          max={limits.lastDate}
          value={resumeOn}
          onChange={(event) => { setResumeOn(event.target.value); setInvalid(false); mutation.setResult(undefined); }}
          aria-invalid={showError || undefined}
          aria-describedby={`${id}-hint${showError ? ` ${id}-error` : ''}`}
          className="max-w-56 tabular-nums"
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('pause.dateHint', range)}</p>
        {showError && <p id={`${id}-error`} className="text-sm text-destructive">{t('pause.outOfRange', range)}</p>}
      </div>
      {!serverInvalid && <SeriesFeedback result={mutation.result} onReload={mutation.refresh} />}
      <Button type="submit" disabled={mutation.pending !== null} aria-busy={mutation.pending !== null} className="w-full sm:w-auto">
        {mutation.pending && <Spinner aria-hidden="true" />}
        {mutation.pending ? t('pause.pending') : t('pause.submit')}
      </Button>
    </form>
  </SeriesSheet>;
}

function ChangeCardSheet({ cards, current, newCard, open, onOpenChange, onChangeCard, onRemoveCard, onAddCard }: {
  cards: NonNullable<SeriesPageData['cards']>;
  current?: string;
  newCard?: SeriesPageData['newCard'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeCard: SeriesHandlers['onChangeCard'];
  onRemoveCard?: SeriesHandlers['onRemoveCard'];
  onAddCard?: SeriesHandlers['onAddCard'];
}) {
  const t = useTranslations('series');
  const payments = useTranslations('payments');
  const id = useId();
  const mutation = useSeriesMutation();
  const removal = useCardRemoval(onRemoveCard, `${id}-cards`);
  const shown = cards.filter((card) => !removal.removed.has(card.id));
  // A card that can't be used here is never chosen for the person, and comes last, beside "Add a card".
  const usable = shown.filter((card) => !card.unusable);
  const unusable = shown.filter((card) => card.unusable);
  const [methodId, setMethodId] = useState(usable.find((card) => card.id === current)?.id ?? usable.find((card) => card.isDefault)?.id ?? usable[0]?.id ?? '');
  // "Add a card" right here (2026-11-23; it went to the payments page, out of the sheet and the series): the form opens
  // in the sheet, and the card it adds is the one chosen once the page brings it.
  const [adding, setAdding] = useState(false);
  const [cardsBefore, setCardsBefore] = useState<ReadonlySet<string> | null>(null);
  const [added, setAdded] = useState('');
  if (cardsBefore) {
    const fresh = usable.find((card) => !cardsBefore.has(card.id));
    if (fresh) {
      setCardsBefore(null);
      setMethodId(fresh.id);
      setAdded(t('changeCard.added'));
    }
  }
  const addHere = newCard && onAddCard
    ? <AddCardForm collection={newCard} onAddCard={async (input) => {
      const before = new Set(cards.map((card) => card.id));
      const result = await onAddCard(input);
      if (result.ok) {
        setCardsBefore(before);
        setAdding(false);
      }
      return result;
    }} />
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!methodId) return;
    const next = await mutation.run('card', () => onChangeCard({ methodId }), t('changeCard.success'));
    if (next?.ok) onOpenChange(false);
  }

  return <SeriesSheet title={t('changeCard.title')} description={t('changeCard.description')} open={open} onOpenChange={onOpenChange} locked={mutation.pending !== null}>
    <p aria-live="polite" className="sr-only">{added}</p>
    {shown.length === 0
      ? <div className="space-y-3">
        <p>{t('changeCard.noCards')}</p>
        {addHere ?? <Link href={routes.app.payments()} className={buttonVariants({ variant: 'outline' })}>{t('changeCard.addCard')}</Link>}
      </div>
      : <form noValidate aria-busy={mutation.pending !== null} onSubmit={submit} className="space-y-4">
        <fieldset disabled={mutation.pending !== null} className="space-y-2">
          <legend id={`${id}-legend`} className="mb-2 font-medium">{t('changeCard.pick')}</legend>
          <RadioGroup id={`${id}-cards`} aria-labelledby={`${id}-legend`} value={methodId} onValueChange={(value) => { setMethodId(value); mutation.setResult(undefined); }} className="gap-2">
            {usable.map((card) => <label key={card.id} htmlFor={`${id}-${card.id}`} className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] bg-card px-3.5 py-3', methodId === card.id && 'border-primary/60 bg-primary/[0.045]')}>
              <RadioGroupItem id={`${id}-${card.id}`} value={card.id} />
              <span className="min-w-0">
                <span className="block font-medium"><PaymentMethodLabel method={{ brand: card.brand, last4: card.last4 }} /></span>
                <span className="block text-sm tabular-nums text-muted-foreground">{payments('picker.expires', { month: String(card.expMonth).padStart(2, '0'), year: String(card.expYear).slice(-2) })}</span>
              </span>
            </label>)}
            {unusable.map((card) => <UnusableCardOption key={card.id} method={card} id={`${id}-${card.id}`} value={card.id} removal={removal} />)}
          </RadioGroup>
        </fieldset>
        <p aria-live="polite" className="sr-only">{removal.announcement}</p>
        {addHere
          ? <Button type="button" variant="link" aria-expanded={adding} aria-controls={`${id}-add`} className="min-h-11 px-0 text-sm font-medium underline underline-offset-4" onClick={() => { setAdded(''); setAdding((current) => !current); }}>{t('changeCard.addCard')}</Button>
          : <Link href={routes.app.payments()} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t('changeCard.addCard')}</Link>}
        <SeriesFeedback result={mutation.result} onReload={mutation.refresh} />
        <Button type="submit" disabled={mutation.pending !== null || !methodId} aria-busy={mutation.pending !== null} className="w-full sm:w-auto">
          {mutation.pending && <Spinner aria-hidden="true" />}
          {mutation.pending ? t('changeCard.pending') : t('changeCard.submit')}
        </Button>
      </form>}
    {/* Its own form, after the one that picks a card (forms can't nest). */}
    {addHere && shown.length > 0 && <div id={`${id}-add`} hidden={!adding} className="mt-5 border-t border-foreground/[0.07] pt-5 dark:border-white/[0.06]">
      {adding && addHere}
    </div>}
  </SeriesSheet>;
}

/** A yes/no before stopping or ending the series. */
function ConfirmDialog({ open, onOpenChange, title, description, confirm, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirm: string; onConfirm: () => void }) {
  const t = useTranslations('series');
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
        <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onConfirm}>{confirm}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/**
 * The series' actions, in the order the server gives them: pause (a sheet with the resume date), start again,
 * change the card (a sheet with the client's saved cards), stop or end (a confirmation first), and the
 * conversation.
 */
export function SeriesActions({ data, handlers }: { data: SeriesPageData; handlers: SeriesHandlers }) {
  const t = useTranslations('series');
  const { formatDate } = useFormat();
  const { series } = data;
  const other = series.viewerRole === 'poster' ? series.helper : series.client;
  const mutation = useSeriesMutation();
  const [sheet, setSheet] = useState<'pause' | 'card' | 'stop' | 'end' | null>(null);
  if (series.actions.length === 0) return null;
  const endDate = data.endsOnIfEnded ? formatDate(dayOf(data.endsOnIfEnded)) : '';

  function tap(id: SeriesActionId) {
    mutation.setResult(undefined);
    switch (id) {
      case 'pause_series': return setSheet('pause');
      case 'change_card': return setSheet('card');
      case 'cancel_series': return setSheet('stop');
      case 'end_series': return setSheet('end');
      case 'resume_series': return void mutation.run(id, () => handlers.onResume(), t('resume.success'));
      case 'message': return void mutation.run(id, () => handlers.onMessage());
    }
  }

  return <section aria-label={t('actionsLabel')} className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {series.actions.map((id) => {
        const Icon = icons[id];
        const busy = mutation.pending === id;
        const quiet = id === 'cancel_series' || id === 'end_series';
        return <Button key={id} type="button" variant={id === 'resume_series' ? 'default' : 'outline'} disabled={mutation.pending !== null} aria-busy={busy || undefined} onClick={() => tap(id)} className={cn(quiet && 'text-destructive hover:text-destructive')}>
          {busy ? <Spinner aria-hidden="true" /> : <Icon aria-hidden="true" />}
          {id === 'message' ? t('actions.message', { name: other.displayName }) : t(`actions.${id}`)}
        </Button>;
      })}
    </div>
    <SeriesFeedback result={mutation.result} onReload={mutation.refresh} />
    {data.pauseLimits && series.actions.includes('pause_series') && <PauseSheet limits={data.pauseLimits} open={sheet === 'pause'} onOpenChange={(open) => setSheet(open ? 'pause' : null)} onPause={handlers.onPause} />}
    {series.actions.includes('change_card') && <ChangeCardSheet cards={data.cards ?? []} current={series.card?.methodId} newCard={data.newCard} open={sheet === 'card'} onOpenChange={(open) => setSheet(open ? 'card' : null)} onChangeCard={handlers.onChangeCard} onRemoveCard={handlers.onRemoveCard} onAddCard={handlers.onAddCard} />}
    <ConfirmDialog
      open={sheet === 'stop'}
      onOpenChange={(open) => setSheet(open ? 'stop' : null)}
      title={t('stop.title')}
      description={t('stop.description')}
      confirm={t('stop.confirm')}
      onConfirm={() => { setSheet(null); void mutation.run('cancel_series', () => handlers.onCancel(), t('stop.success')); }}
    />
    <ConfirmDialog
      open={sheet === 'end'}
      onOpenChange={(open) => setSheet(open ? 'end' : null)}
      title={t('end.title')}
      description={t('end.description', { date: endDate, name: other.displayName })}
      confirm={t('end.confirm')}
      onConfirm={() => { setSheet(null); void mutation.run('end_series', () => handlers.onEnd(), t('end.success', { date: endDate })); }}
    />
  </section>;
}
