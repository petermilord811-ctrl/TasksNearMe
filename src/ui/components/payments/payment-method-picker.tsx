'use client';

import { useId, useRef } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { CardRemovalHandlers, PaymentChoice, PaymentPanelData } from '@/contracts';
import { Badge } from '@/ui/primitives/badge';
import { Checkbox } from '@/ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@/ui/primitives/radio-group';
import { cn } from '@/ui/lib/utils';
import { PaymentMethodLabel } from './payment-method-label';
import { StripeCardField } from './stripe-card-field';
import { UnusableCardOption, useCardRemoval } from './unusable-card';

/** A payment choice: a soft card that lifts on hover; chosen, it takes the brand's ring. */
const optionCard = 'flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-foreground/[0.09] bg-card px-4 py-3 transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:border-foreground/20 hover:shadow-[0_8px_22px_-16px_rgb(60_30_10/0.45)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring motion-reduce:transition-none';
const optionSelected = 'border-primary/60 bg-primary/[0.045] shadow-[0_0_0_1px_var(--primary)] hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--primary)]';

type NewCardChoice = Extract<PaymentChoice, { kind: 'dev_card' | 'stripe_card' }>;

/** A new card as this panel collects it: Stripe's field (no card yet), or the first development test card. */
function newCardChoice(panel: PaymentPanelData): NewCardChoice {
  return panel.newCard.kind === 'stripe' ? { kind: 'stripe_card', paymentMethodId: '', save: false } : { kind: 'dev_card', card: panel.newCard.testCards[0] ?? 'success', save: false };
}

/**
 * Defaults are selection behavior only; payment availability comes from the supplied panel. A card that can't be used
 * here (`unusable`) is never chosen for the person, even when it's their default.
 */
export function getDefaultPaymentChoice(panel: PaymentPanelData): PaymentChoice {
  const usable = panel.methods.filter((candidate) => !candidate.unusable);
  const method = usable.find((candidate) => candidate.isDefault) ?? usable[0];
  return method ? { kind: 'saved', methodId: method.id } : newCardChoice(panel);
}

interface PaymentMethodPickerProps {
  panel: PaymentPanelData;
  /** A form's `payment` field (optional on the booking confirmation since 2026-11-23: a direct booking has none). */
  field: Pick<ControllerRenderProps, 'name' | 'onBlur' | 'ref' | 'disabled'> & { value?: PaymentChoice; onChange: (value: PaymentChoice) => void };
  disabled?: boolean;
  error?: string;
  id?: string;
  /**
   * The card is kept whatever the client picks (regular visits, a booking paid later): no "Save this card"
   * choice, a note saying so instead (the server keeps a new card).
   */
  keepCard?: boolean;
  /**
   * Removes a saved card that can't be used here (`SavedPaymentMethod.unusable`), the payments page's action. Without
   * it the card shows disabled only. Nothing removes a card unless the person asks.
   */
  onRemoveCard?: CardRemovalHandlers['onRemoveCard'];
}

export function PaymentMethodPicker({ panel, field, disabled = false, error, id: suppliedId, keepCard = false, onRemoveCard }: PaymentMethodPickerProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const t = useTranslations('payments');
  const disabledControl = disabled || field.disabled;
  const lastNewCard = useRef<NewCardChoice>(newCardChoice(panel));
  const choice = field.value ?? getDefaultPaymentChoice(panel);
  const selected = choice.kind === 'saved' ? `saved:${choice.methodId}` : 'new';
  const removal = useCardRemoval(onRemoveCard, id);
  const shown = panel.methods.filter((method) => !removal.removed.has(method.id));
  const usable = shown.filter((method) => !method.unusable);
  // Cards that can't be used here come last, beside "Use a new card", the way forward.
  const unusable = shown.filter((method) => method.unusable);

  function changeChoice(value: PaymentChoice) {
    if (disabledControl) return;
    if (value.kind !== 'saved') lastNewCard.current = value;
    field.onChange(value);
  }

  return <div className="min-w-0 space-y-4">
    <RadioGroup
      id={id}
      name={`${field.name}.methodId`}
      aria-label={t('picker.label')}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
      aria-invalid={!!error}
      value={selected}
      disabled={disabledControl}
      onBlur={field.onBlur}
      onValueChange={(value) => {
        if (value === 'new') changeChoice(lastNewCard.current);
        else {
          if (choice.kind !== 'saved') lastNewCard.current = choice;
          changeChoice({ kind: 'saved', methodId: value.slice('saved:'.length) });
        }
      }}
      className="gap-3"
    >
      {usable.map((method, index) => <label
        key={method.id}
        htmlFor={`${id}-saved-${index}`}
        className={cn(optionCard, selected === `saved:${method.id}` && optionSelected, 'min-h-16', disabledControl && 'cursor-not-allowed opacity-60')}
      >
        <RadioGroupItem id={`${id}-saved-${index}`} value={`saved:${method.id}`} ref={selected === `saved:${method.id}` ? field.ref : undefined} className="scroll-mb-40" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="space-y-1">
            <span className="block font-medium"><PaymentMethodLabel method={method} /></span>
            <span className="block text-sm tabular-nums text-muted-foreground">{t('picker.expires', { month: String(method.expMonth).padStart(2, '0'), year: String(method.expYear).slice(-2) })}</span>
          </span>
          {method.isDefault && <Badge variant="secondary">{t('picker.default')}</Badge>}
        </span>
      </label>)}
      {unusable.map((method, index) => <UnusableCardOption key={method.id} method={method} id={`${id}-unusable-${index}`} value={`saved:${method.id}`} removal={removal} disabled={disabledControl} />)}
      <label htmlFor={`${id}-new`} className={cn(optionCard, selected === 'new' && optionSelected, 'min-h-14', disabledControl && 'cursor-not-allowed opacity-60')}>
        <RadioGroupItem id={`${id}-new`} value="new" ref={selected === 'new' ? field.ref : undefined} className="scroll-mb-40" />
        <span className="font-medium">{t('picker.newCard')}</span>
      </label>
    </RadioGroup>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('picker.hint')}</p>
    <p aria-live="polite" className="sr-only">{removal.announcement}</p>
    {choice.kind === 'dev_card' && panel.newCard.kind === 'dev' && <div className="space-y-3 rounded-2xl border border-dashed border-foreground/15 bg-muted/40 p-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
      <p id={`${id}-development`} className="font-medium">{t('picker.development')}</p>
      <p id={`${id}-development-hint`} className="text-sm text-muted-foreground">{t('picker.developmentHint')}</p>
      <RadioGroup
        id={`${id}-card`}
        name={`${field.name}.card`}
        aria-label={t('picker.outcome')}
        aria-describedby={`${id}-development ${id}-development-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={!!error}
        disabled={disabledControl}
        value={choice.card}
        onBlur={field.onBlur}
        onValueChange={(value) => {
          const card = panel.newCard.kind === 'dev' ? panel.newCard.testCards.find((candidate) => candidate === value) : undefined;
          if (card) changeChoice({ ...choice, card });
        }}
        className="gap-1 sm:grid-cols-2"
      >
        {panel.newCard.testCards.map((card) => <label key={card} htmlFor={`${id}-card-${card}`} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md py-2 pr-2', disabledControl && 'cursor-not-allowed opacity-60')}>
          <RadioGroupItem id={`${id}-card-${card}`} value={card} className="scroll-mb-40" />
          <span className="text-sm">{t(`testCards.${card}`)}</span>
        </label>)}
      </RadioGroup>
      {keepCard ? <p className="text-sm text-muted-foreground">{t('picker.kept')}</p> : <label htmlFor={`${id}-save`} className={cn('flex min-h-11 cursor-pointer items-center gap-3', disabledControl && 'cursor-not-allowed opacity-60')}>
        <Checkbox id={`${id}-save`} name={`${field.name}.save`} checked={choice.save} disabled={disabledControl} onBlur={field.onBlur} onCheckedChange={(checked) => changeChoice({ ...choice, save: checked === true })} className="scroll-mb-40" />
        <span className="text-sm">{t('picker.save')}</span>
      </label>}
    </div>}
    {choice.kind === 'stripe_card' && panel.newCard.kind === 'stripe' && <div className="space-y-3 rounded-2xl border border-foreground/[0.09] bg-muted/30 p-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
      <StripeCardField publishableKey={panel.newCard.publishableKey} disabled={disabledControl} describedBy={`${id}-stripe-hint`} onChange={(paymentMethodId) => changeChoice({ ...choice, paymentMethodId })} />
      <p id={`${id}-stripe-hint`} className="text-sm text-muted-foreground">{t('picker.stripeHint')}</p>
      {keepCard ? <p className="text-sm text-muted-foreground">{t('picker.kept')}</p> : <label htmlFor={`${id}-save`} className={cn('flex min-h-11 cursor-pointer items-center gap-3', disabledControl && 'cursor-not-allowed opacity-60')}>
        <Checkbox id={`${id}-save`} name={`${field.name}.save`} checked={choice.save} disabled={disabledControl} onBlur={field.onBlur} onCheckedChange={(checked) => changeChoice({ ...choice, save: checked === true })} className="scroll-mb-40" />
        <span className="text-sm">{t('picker.save')}</span>
      </label>}
    </div>}
    <div id={`${id}-error`} aria-live="polite">{error && <p className="text-sm text-destructive">{error}</p>}</div>
  </div>;
}
