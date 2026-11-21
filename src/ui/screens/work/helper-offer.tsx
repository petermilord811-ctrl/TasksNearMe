'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult, HelperOfferView, HelperTaskView, HelperWorkHandlers, ISODateTime } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { Deadline } from '@/ui/components/time/deadline';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { OfferForm } from './offer-form';

/** Where the form marks the task whose new offer just went (this tab), for the summary to take focus once (J-H8). */
const sentKey = (taskId: string) => `tnm:offer:sent:${taskId}`;

function OfferSummary({ offer, now, headingRef }: { offer: HelperOfferView; now: ISODateTime; headingRef?: Ref<HTMLHeadingElement> }) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('helperTask');
  const status = useOfferStatus(offer.status, 'helper');
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={headingRef} tabIndex={-1} className="rounded-sm font-heading text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:text-[22px]/7.5">{t('yourOffer')}</h2><StatusBadge {...status} /></div>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('offerPrice')}</dt><dd className="font-semibold tabular-nums">{offer.pricing.type === 'fixed' ? formatMoney(offer.pricing.priceCents) : t('hourlyPrice', { rate: formatMoney(offer.pricing.rateCents), estimate: formatHours(offer.pricing.estimatedHours), cap: formatHours(offer.pricing.hoursCap) })}</dd></div>
      <div className="space-y-1"><dt className="text-sm text-muted-foreground">{t('start')}</dt><dd className="tabular-nums"><time dateTime={offer.proposedStart}>{formatDateTime(offer.proposedStart)}</time></dd></div>
      <div className="space-y-1 sm:col-span-2"><dt className="text-sm text-muted-foreground">{t('message')}</dt><dd className="whitespace-pre-wrap break-words">{offer.message || t('noMessage')}</dd></div>
      <div className="space-y-2 sm:col-span-2"><dt className="text-sm text-muted-foreground">{t('brings')}</dt><dd>{offer.brings.length ? <ul className="flex flex-wrap gap-2">{offer.brings.map((item, index) => <li key={`${index}-${item}`} className="max-w-full break-words rounded-full bg-muted px-3 py-1 text-sm">{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t('noBrings')}</p>}</dd></div>
    </dl>
    <Deadline at={offer.expiresAt} now={now} label={t('expires')} />
    <div className="space-y-1 text-sm tabular-nums text-muted-foreground"><p>{t('revision', { number: offer.revision })}{offer.revision > 1 && <span className="ml-2 font-medium text-foreground">{t('updatedOffer')}</span>}</p><p><time dateTime={offer.submittedAt}>{t('submitted', { date: formatDateTime(offer.submittedAt) })}</time></p></div>
    <PriceBreakdown breakdown={offer.breakdown} variant="helper" title={t('earnings')} />
  </div>;
}

export function HelperOffer({ data, handlers, now, initialRevising = false, initialResult }: { data: HelperTaskView; handlers: HelperWorkHandlers; now: ISODateTime; initialRevising?: boolean; initialResult?: ActionResult }) {
  const feedback = useTranslations('feedback');
  const actions = useTranslations('actions');
  const [revising, setRevising] = useState(initialRevising);
  const [confirmRevision, setConfirmRevision] = useState(false);
  const revisionTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);

  // Right after Send offer, the summary that replaced the form takes focus and comes into view (journeys on a phone, J-H8):
  // the page stayed where the button was, the summary's heading above it, and nothing said the offer went.
  useEffect(() => {
    if (!data.myOffer) return;
    let sent = false;
    try {
      sent = window.sessionStorage.getItem(sentKey(data.task.id)) !== null;
      window.sessionStorage.removeItem(sentKey(data.task.id));
    } catch {
      return;
    }
    const heading = summaryHeading.current;
    if (!sent || !heading) return;
    heading.focus({ preventScroll: true });
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [data.myOffer, data.task.id]);

  useEffect(() => {
    if (revising) contentRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    else if (restoreFocus.current) {
      const edit = contentRef.current?.querySelector<HTMLButtonElement>('[data-action-id="revise_offer"]');
      const more = contentRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
      (edit?.getClientRects().length ? edit : more ?? edit)?.focus();
      restoreFocus.current = false;
    }
  }, [revising]);

  const markSent = () => {
    try {
      window.sessionStorage.setItem(sentKey(data.task.id), '1');
    } catch {
      // Storage off: the summary just doesn't take focus.
    }
  };
  if (!data.myOffer) return <OfferForm data={data} handlers={handlers} initialResult={initialResult} onSent={markSent} />;
  const offer = data.myOffer;
  return <div ref={contentRef} className="space-y-5 rounded-xl border bg-card p-card shadow-card">
    {revising ? <OfferForm data={data} handlers={handlers} revising onCancel={() => { restoreFocus.current = true; setRevising(false); }} initialResult={initialResult} /> : <>
      <OfferSummary offer={offer} now={now} headingRef={summaryHeading} />
      <ActionBar actions={offer.actions} sticky onRequestAction={(id, trigger) => {
        if (id !== 'revise_offer') return false;
        revisionTrigger.current = trigger;
        if (offer.actions.find((action) => action.id === id)?.confirm) setConfirmRevision(true);
        else setRevising(true);
        return true;
      }} onAction={(id) => {
        const action = offer.actions.find((item) => item.id === id);
        return action ? handlers.onOfferAction({ offerId: offer.id, action: action.id }) : Promise.resolve({ ok: false, code: 'not_allowed' });
      }} />
    </>}
    <AlertDialog open={confirmRevision} onOpenChange={setConfirmRevision}><AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); if (!revising) revisionTrigger.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{feedback('confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{feedback('confirmDescription', { action: actions('revise_offer') })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{feedback('keepEditing')}</AlertDialogCancel><AlertDialogAction onClick={() => setRevising(true)}>{feedback('confirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
