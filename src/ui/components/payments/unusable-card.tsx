'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { ActionResult, CardRemovalHandlers, SavedPaymentMethod } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { RadioGroupItem } from '@/ui/primitives/radio-group';
import { Spinner } from '@/ui/primitives/spinner';
import { PaymentMethodLabel } from './payment-method-label';

/** Removing saved cards that can't be used here, in one payment form. */
export interface CardRemoval {
  /** Cards removed here. They leave the list at once, and the page's refreshed data drops them too. */
  removed: ReadonlySet<string>;
  removing: string | null;
  failure: { methodId: string; code: string } | null;
  /** For the form's polite live line (no status role: the form's own result stays the one status). */
  announcement: string;
  canRemove: boolean;
  remove: (methodId: string) => Promise<void>;
}

/**
 * Removing a saved card that can't be used here (`SavedPaymentMethod.unusable`) from a payment form, with the payments
 * page's action. `groupId` is the radio group's id. Once a card goes, its Remove button goes with it, so focus moves to
 * the chosen option (or the first one that can be chosen).
 */
export function useCardRemoval(onRemoveCard: CardRemovalHandlers['onRemoveCard'], groupId: string): CardRemoval {
  const t = useTranslations('payments');
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [removing, setRemoving] = useState<string | null>(null);
  const [failure, setFailure] = useState<CardRemoval['failure']>(null);
  const [announcement, setAnnouncement] = useState('');
  const locked = useRef(false);

  async function remove(methodId: string) {
    if (!onRemoveCard || locked.current) return;
    locked.current = true;
    setRemoving(methodId); setFailure(null); setAnnouncement('');
    let result: ActionResult;
    try { result = await onRemoveCard({ methodId }); }
    catch { result = { ok: false, code: 'unknown' }; }
    locked.current = false;
    setRemoving(null);
    // Already gone (removed in another tab) counts as removed.
    if (result.ok || result.code === 'not_found') {
      flushSync(() => setRemoved((current) => new Set(current).add(methodId)));
      setAnnouncement(t('picker.removed'));
      const group = document.getElementById(groupId);
      (group?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? group?.querySelector<HTMLElement>('[role="radio"]:not([disabled])'))?.focus();
    } else {
      setFailure({ methodId, code: result.code });
      setAnnouncement(result.code === 'not_allowed' ? t('picker.removeNotAllowed') : t('picker.removeFailed'));
    }
  }

  return { removed, removing, failure, announcement, canRemove: Boolean(onRemoveCard), remove };
}

/**
 * A saved card that can't be used here, inside a payment form's radio group: shown disabled with the same neutral
 * line as the refusal, never chosen, and with a Remove button when the form has the action. Nothing removes it
 * unless the person asks.
 */
export function UnusableCardOption({ method, id, value, removal, disabled = false }: {
  method: SavedPaymentMethod;
  /** The option's own id (the radio's). */
  id: string;
  /** The radio's value in its group. */
  value: string;
  removal: CardRemoval;
  disabled?: boolean;
}) {
  const t = useTranslations('payments');
  const pending = removal.removing === method.id;
  const failure = removal.failure?.methodId === method.id ? removal.failure.code : undefined;
  return <div data-unusable="" className="flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-foreground/[0.09] bg-muted/40 px-4 py-3">
    <RadioGroupItem id={id} value={value} disabled aria-labelledby={`${id}-label`} aria-describedby={`${id}-why`} />
    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="min-w-0 space-y-1">
        <span id={`${id}-label`} className="block font-medium text-muted-foreground"><PaymentMethodLabel method={method} /></span>
        <span id={`${id}-why`} className="block text-sm text-muted-foreground">{t('picker.unusable')}</span>
        {failure && <span className="block text-sm text-destructive">{failure === 'not_allowed' ? t('picker.removeNotAllowed') : t('picker.removeFailed')}</span>}
      </span>
      {removal.canRemove && <Button type="button" variant="outline" size="sm" disabled={disabled || removal.removing !== null} aria-busy={pending} aria-describedby={`${id}-label`} onClick={() => void removal.remove(method.id)}>
        {pending && <Spinner aria-hidden="true" />}
        {pending ? t('picker.removing') : t('picker.remove')}
      </Button>}
    </span>
  </div>;
}
