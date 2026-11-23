'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import { Ellipsis, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionDescriptor, ActionResult, ISODateTime } from '@/contracts';
import { openInChatWindow } from '@/ui/lib/chat-window-open';
import { useFormat } from '@/ui/lib/format';
import { actionTray, trayGap } from '@/ui/components/bookings/surface';
import { cn } from '@/ui/lib/utils';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';
import { ConnectionAwareText, mayBeSignedOut, sessionGone, signInAgainHref } from '@/ui/components/forms/connection-aware-text';

export interface ActionBarProps {
  actions: ActionDescriptor[];
  onAction: (id: string) => Promise<ActionResult>;
  sticky?: boolean;
  /** For actions near the top of a flow page; the caller reserves measured bottom space. */
  mobileFixed?: boolean;
  barRef?: Ref<HTMLDivElement>;
  /** Return true when a screen opens its own confirmation flow (for example, a required reason). */
  onRequestAction?: (id: string, trigger: HTMLButtonElement) => boolean;
  /** Links stay in descriptor order and respect the same enabled/confirmation state. */
  getActionLink?: (id: string) => { href: string; download?: boolean } | undefined;
  onResult?: (result: ActionResult) => void;
  renderResult?: (result: ActionResult) => ReactNode;
  /** Context that stays beside the actions when the bar is fixed on phones. */
  description?: ReactNode;
  /** Static initial states for previews; normal screens leave these unset. */
  initialResult?: ActionResult;
  initialPending?: string;
  /** The page's clock: a reason's time today reads "at 8:00 am"; another day, or without it, names the day. */
  now?: ISODateTime;
}

export function ActionBar({ actions, onAction, sticky = false, mobileFixed = false, barRef, onRequestAction, getActionLink, onResult, renderResult, description, initialResult, initialPending, now }: ActionBarProps) {
  const { formatTime, formatDateTime, dayKey } = useFormat();
  const t = useTranslations('actions');
  const reason = useTranslations('actionReasons');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const id = useId();
  const [pendingId, setPendingId] = useState<string | null>(initialPending ?? null);
  const pendingRef = useRef(Boolean(initialPending));
  const [confirmation, setConfirmation] = useState<ActionDescriptor | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement | null>(null);
  const customFlowRequested = useRef(false);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const [signedOutFor, setSignedOutFor] = useState<ActionResult | null>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const restoreAfterPending = useRef(false);
  const group = useRef<HTMLDivElement>(null);
  const resultRegion = useRef<HTMLDivElement>(null);
  /** The last control in the bar that had focus, to notice when a refresh removes it (WCAG 2.4.3). */
  const lastFocus = useRef<HTMLElement | null>(null);

  /**
   * Where keyboard focus goes when the control that had it is gone, such as "Approve task" once the booking is
   * approved: the result message, else the first action still available, else the page's main content.
   */
  function focusAfterRemoval() {
    const region = resultRegion.current;
    const next = region?.textContent?.trim() ? region : group.current?.querySelector<HTMLElement>('[data-action-id]:not(:disabled):not([aria-disabled="true"])');
    (next ?? document.getElementById('main'))?.focus();
  }

  useEffect(() => {
    if (pendingId === null && restoreAfterPending.current) {
      restoreAfterPending.current = false;
      const trigger = confirmationTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      else focusAfterRemoval();
    }
  }, [pendingId]);

  useEffect(() => {
    const last = lastFocus.current;
    if (!last || last.isConnected || pendingRef.current || restoreAfterPending.current) return;
    lastFocus.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    focusAfterRemoval();
  }, [actions]);

  async function run(action: ActionDescriptor) {
    if (!action.enabled || pendingRef.current) return;
    pendingRef.current = true;
    setPendingId(action.id);
    setResult(undefined);
    let result: ActionResult;
    try {
      result = await onAction(action.id);
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    // A failure a lost session explains, while online: asked once whether it ended (bad connections pass, J-N2), before
    // the action frees up.
    const signedOut = mayBeSignedOut(result) && navigator.onLine && (await sessionGone());
    pendingRef.current = false;
    setPendingId(null);
    // Only another page opens (the conversation, the review form): nothing changed, so there's nothing to confirm.
    if (result.ok && result.code === 'opened') {
      // A conversation (Message) opens in the chat window on wide screens, the page behind staying (2026-11-23).
      if (result.redirectTo && !openInChatWindow(result.redirectTo)) router.push(result.redirectTo);
      onResult?.(result);
      return;
    }
    // No answer says why when it can: no network (bad connections pass, J-N3), or a session that ended (J-N2), for the
    // toast and the line below alike.
    const text = signedOut
      ? feedback('error.signed_out')
      : !result.ok && result.code === 'unknown' && !navigator.onLine
        ? feedback('error.offline')
        : feedback(`${result.ok ? 'success' : 'error'}.${result.code}`);
    setSignedOutFor(signedOut ? result : null);
    setResult(result);
    if (result.ok) {
      toast.success(text);
      if (result.redirectTo && !openInChatWindow(result.redirectTo)) router.push(result.redirectTo);
    } else {
      toast.error(text);
    }
    onResult?.(result);
  }

  function resultContent() {
    if (!result) return null;
    if (renderResult) return renderResult(result);
    if (signedOutFor === result) return <p className="text-sm text-destructive">{feedback('error.signed_out')} <Link href={signInAgainHref()} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{feedback('error.signInAgain')}</Link></p>;
    return <p className={cn('text-sm', result.ok ? 'text-success' : 'text-destructive')}><ConnectionAwareText text={feedback(`${result.ok ? 'success' : 'error'}.${result.code}`)} offlineText={feedback('error.offline')} unknown={!result.ok && result.code === 'unknown'} /></p>;
  }

  function renderAction(action: ActionDescriptor, context: string) {
    const disabledReason = action.disabledReason;
    const reasonText = !disabledReason
      ? undefined
      : disabledReason.code === 'available_at' || disabledReason.code === 'deadline_passed'
        ? !disabledReason.at
          ? reason(`${disabledReason.code}_without_time`)
          // Another day than the page's names the day (journeys on a phone: "Available at 8:00 am" four days out).
          : now && dayKey(disabledReason.at) === dayKey(now)
            ? reason(disabledReason.code, { at: formatTime(disabledReason.at) })
            : reason(`${disabledReason.code}_on`, { at: formatDateTime(disabledReason.at) })
        : reason(disabledReason.code, { at: disabledReason.at ? formatTime(disabledReason.at) : '' });
    const reasonId = `${id}-${context}-${action.id}-reason`;
    const pending = pendingId === action.id;
    const link = getActionLink?.(action.id);
    const disabled = !action.enabled || pendingId !== null;
    // A destructive action after the first is quiet, red words on an outline, so it never outweighs the next step
    // beside it (audit M32); its confirmation is where it turns red.
    const quiet = action.kind === 'destructive' && action.id !== actions[0]?.id;
    const variant = action.kind === 'primary' ? 'default' : action.kind === 'destructive' && !quiet ? 'destructive' : 'outline';
    const tone = quiet ? 'text-destructive hover:text-destructive' : undefined;
    return (
      <div key={action.id} className="min-w-0 flex-1 lg:flex-none">
        {link ? <a
          href={disabled ? undefined : link.href}
          download={link.download}
          role="link"
          aria-disabled={disabled || undefined}
          aria-describedby={reasonText ? reasonId : undefined}
          tabIndex={disabled ? -1 : undefined}
          data-action-id={action.id}
          className={cn(buttonVariants({ variant }), 'min-h-11 w-full whitespace-normal px-4 py-2 text-center aria-disabled:pointer-events-none aria-disabled:opacity-50 lg:w-auto', tone)}
          onClick={(event) => {
            if (disabled || pendingRef.current) { event.preventDefault(); return; }
            if (action.confirm) {
              event.preventDefault();
              confirmationTrigger.current = event.currentTarget;
              setConfirmation(action);
              return;
            }
            // A page of the app opens with the router, not a full load, so one with a dialog version opens over this page
            // (Propose a change, Propose a booking; src/app/[locale]/@modal). A download, or a click for a new tab, stays
            // the browser's.
            if (!link.download && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              router.push(link.href);
            }
          }}
        >{t(action.id)}</a> : <Button
          type="button"
          variant={variant}
          disabled={disabled}
          aria-busy={pending}
          aria-describedby={reasonText ? reasonId : undefined}
          data-action-id={action.id}
          className={cn('min-h-11 w-full whitespace-normal px-4 py-2 text-center lg:w-auto', tone)}
          onClick={(event) => {
            if (pendingRef.current) return;
            if (onRequestAction?.(action.id, context === 'more' ? moreTrigger.current ?? event.currentTarget : event.currentTarget)) {
              customFlowRequested.current = context === 'more';
              setMoreOpen(false);
              return;
            }
            if (action.confirm) {
              confirmationTrigger.current = event.currentTarget;
              setConfirmation(action);
            } else {
              void run(action);
            }
          }}
        >
          {pending && <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />}
          {t(action.id)}
        </Button>}
        {reasonText && <p id={reasonId} className="mt-2 max-w-xs text-sm text-muted-foreground">{reasonText}</p>}
      </div>
    );
  }

  if (actions.length === 0) return null;
  // Actions with consequences to spell out (approving pays the helper) have their own words; the rest ask generically.
  const confirmationCopy = confirmation && feedback.has(`confirmations.${confirmation.id}.title`) ? confirmation.id : null;

  // In the page: a hairline above the actions. Sticky, and fixed on phones: a glass tray kept above the tab dock by
  // `bottom-app-navigation` (`--app-bottom-offset`), floating `--action-tray-gap` higher, so the next step is always
  // in reach. A fixed tray floats by its bottom margin; a sticky one by a small lift (see `actionTray`).
  return (
    <div ref={barRef} onFocus={(event) => { if (event.currentTarget.contains(event.target)) lastFocus.current = event.target; }} className={cn(
      'min-w-0',
      sticky ? actionTray : 'border-t border-foreground/[0.08] pt-4 dark:border-white/[0.08]',
      mobileFixed && `${trayGap} max-lg:fixed max-lg:inset-x-2.5 max-lg:bottom-app-navigation max-lg:z-10 max-lg:mx-auto max-lg:mt-0! max-lg:mb-(--action-tray-gap)! max-lg:translate-y-0 max-lg:max-h-[60dvh] max-lg:max-w-[45rem] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-[1.375rem] max-lg:border max-lg:border-foreground/[0.07] max-lg:app-glass max-lg:p-3 max-lg:shadow-[0_18px_40px_-24px_rgb(40_20_5/0.45)] dark:max-lg:border-white/[0.08] dark:max-lg:shadow-[0_18px_40px_-20px_rgb(0_0_0/0.75)]`,
    )}>
      {description && <div className="mb-3 text-sm">{description}</div>}
      <div ref={group} role="group" aria-label={feedback('actionBar')} aria-busy={pendingId !== null} className="flex flex-wrap items-start gap-3">
        {renderAction(actions[0], 'first')}
        {actions.length > 1 && <>
          <div className="hidden flex-wrap items-start gap-3 lg:contents">
            {actions.slice(1).map((action) => renderAction(action, 'desktop'))}
          </div>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild><Button ref={moreTrigger} data-action-more variant="outline" disabled={pendingId !== null} className="min-h-11 min-w-11 lg:hidden"><Ellipsis aria-hidden="true" className="size-4" />{feedback('more')}</Button></SheetTrigger>
            <SheetContent side="bottom" onCloseAutoFocus={(event) => {
              if (customFlowRequested.current) { event.preventDefault(); customFlowRequested.current = false; }
            }} className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetHeader><SheetTitle>{feedback('moreTitle')}</SheetTitle><SheetDescription>{feedback('moreDescription')}</SheetDescription></SheetHeader>
              <div className="grid gap-4 px-4 pb-4">{actions.slice(1).map((action) => renderAction(action, 'more'))}</div>
              <div aria-live="polite" aria-atomic="true" className="px-4 pb-4">
                {resultContent()}
              </div>
            </SheetContent>
          </Sheet>
        </>}
      </div>
      {/* The result's record, not a live region: its toast says it (sonner's region), and two regions read it twice
          (accessibility pass, J-A8). Focus lands here when the control that had it is gone. The More sheet's line
          above stays live: the modal sheet hides the toasts from screen readers. */}
      <div ref={resultRegion} tabIndex={-1} className="mt-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {resultContent()}
      </div>
      <AlertDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); if (!pendingRef.current) confirmationTrigger.current?.focus(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy ? feedback(`confirmations.${confirmationCopy}.title`) : feedback('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationCopy ? feedback(`confirmations.${confirmationCopy}.description`) : feedback('confirmDescription', { action: confirmation ? t(confirmation.id) : '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{feedback('keepEditing')}</AlertDialogCancel>
            {confirmation && getActionLink?.(confirmation.id) ? <AlertDialogAction asChild><a href={getActionLink(confirmation.id)?.href} download={getActionLink(confirmation.id)?.download}>{confirmationCopy ? feedback(`confirmations.${confirmationCopy}.confirm`) : feedback('confirm')}</a></AlertDialogAction> : <AlertDialogAction className={cn(confirmation?.kind === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')} onClick={() => {
              const action = confirmation;
              setConfirmation(null);
              if (action) {
                restoreAfterPending.current = true;
                void run(action);
              }
            }}>{confirmationCopy ? feedback(`confirmations.${confirmationCopy}.confirm`) : feedback('confirm')}</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
