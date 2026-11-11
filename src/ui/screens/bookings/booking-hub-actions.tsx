'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookmarkCheck, CircleAlert, CircleCheck } from 'lucide-react';
import { routes, type ActionResult, type BookingActionId, type BookingHubHandlers, type BookingSheetHandlers, type BookingView } from '@/contracts';
import { formatDateTime, formatTime } from '@/shared/format';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { CancelBookingSheet, CantAccessSheet, ReportNoShowSheet, RunningLateSheet, SafetyReportSheet } from './sheets';

const sheetComponents = {
  cancel: CancelBookingSheet,
  running_late: RunningLateSheet,
  report_no_show: ReportNoShowSheet,
  cant_access: CantAccessSheet,
  safety_report: SafetyReportSheet,
};
type SheetAction = keyof typeof sheetComponents;

function isSheetAction(id: string): id is SheetAction {
  return Object.hasOwn(sheetComponents, id);
}

export interface BookingHubActionsProps {
  data: BookingView;
  handlers: BookingHubHandlers;
  sheets: BookingSheetHandlers;
  /** Preview-only snapshots, without submitting an action on mount. */
  initialResult?: ActionResult;
  initialPending?: BookingActionId;
}

export function BookingHubActions({ data, handlers, sheets, initialResult, initialPending }: BookingHubActionsProps) {
  const t = useTranslations('bookingHub');
  const feedback = useTranslations('feedback');
  const forms = useTranslations('forms');
  const sheetCopy = useTranslations('bookingSheets');
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const sheetTrigger = useRef<HTMLElement | null>(null);
  const [sheetAction, setSheetAction] = useState<SheetAction | null>(null);
  const [sheetSuccess, setSheetSuccess] = useState<{ action: SheetAction; result: ActionResult }>();
  const ActiveSheet = sheetAction ? sheetComponents[sheetAction] : null;
  const savedStatus = data.helperSaved ? <p className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground"><BookmarkCheck aria-hidden="true" className="size-4" />{t('saved')}</p> : null;
  const responseDeadline = data.viewerRole === 'poster' ? data.deadlines.posterResponseDueAt : undefined;

  useEffect(() => {
    const bar = barRef.current;
    const page = bar?.closest<HTMLElement>('[data-booking-hub]');
    if (!bar || !page) return;
    const reserveSpace = () => page.style.setProperty('--booking-actions-height', `${bar.getBoundingClientRect().height}px`);
    reserveSpace();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(reserveSpace);
    observer?.observe(bar);
    window.addEventListener('resize', reserveSpace);
    // Keep keyboard targets above the fixed bar, including at browser zoom.
    const keepFocusVisible = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest('[role="dialog"], [role="alertdialog"]') || bar.contains(target) || getComputedStyle(bar).position !== 'fixed') return;
      const overlap = target.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
      if (overlap > 0) window.scrollBy({ top: overlap + 16, behavior: 'instant' });
    };
    page.addEventListener('focusin', keepFocusVisible);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reserveSpace);
      page.removeEventListener('focusin', keepFocusVisible);
      page.style.removeProperty('--booking-actions-height');
    };
  }, [data.id, data.actions.length]);

  return <>
    {data.actions.length === 0 && savedStatus}
    <ActionBar
    actions={data.actions}
    mobileFixed
    barRef={barRef}
    initialResult={initialResult}
    initialPending={initialPending}
    description={savedStatus || responseDeadline ? <div className="space-y-2">
      {savedStatus}
      {responseDeadline && <time dateTime={responseDeadline} className="block font-medium tabular-nums text-warning">{sheetCopy('answerBy', { time: formatTime(responseDeadline) })}</time>}
    </div> : undefined}
    onRequestAction={(action, trigger) => {
      if (!isSheetAction(action)) return false;
      sheetTrigger.current = trigger;
      setSheetSuccess(undefined);
      setSheetAction(action);
      return true;
    }}
    getActionLink={(action) => {
      if (action === 'add_to_calendar') return { href: routes.app.bookingCalendar(data.id), download: true };
      if (action === 'propose_change') return { href: routes.app.bookingProposeChange(data.id) };
      return undefined;
    }}
    onAction={(action) => handlers.onAction({ action: action as BookingActionId })}
    onResult={(result) => {
      if (result.ok && result.code === 'updated' && !result.redirectTo) router.refresh();
    }}
    renderResult={(result) => <Alert role="status" className={result.ok ? 'border-success/30' : 'border-destructive/30'}>
      {result.ok ? <CircleCheck aria-hidden="true" className="text-success" /> : <CircleAlert aria-hidden="true" className="text-destructive" />}
      <AlertDescription className="space-y-2 text-foreground">
        <p>{!result.ok && result.code === 'not_allowed' ? t('actionErrors.not_allowed') : feedback(`${result.ok ? 'success' : 'error'}.${result.code}`)}</p>
        {!result.ok && result.code === 'rate_limited' && result.retryAt && <p className="tabular-nums">{forms('retryAt', { at: formatDateTime(result.retryAt) })}</p>}
        {!result.ok && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(result.code === 'not_allowed' || result.code === 'version_conflict') && <Button type="button" variant="outline" onClick={() => router.refresh()}>{t('reload')}</Button>}
          <Link href={routes.help()} className="inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-4">{forms('getHelp')}</Link>
        </div>}
      </AlertDescription>
    </Alert>}
  />
    <div aria-live="polite" aria-atomic="true">
      {sheetSuccess?.result.ok && <Alert role="status" className="border-success/30">
        <CircleCheck aria-hidden="true" className="text-success" />
        <AlertDescription className="text-foreground">{sheetSuccess.action === 'safety_report'
          ? sheetCopy('safety.sent')
          : feedback(`success.${sheetSuccess.result.code}`)}</AlertDescription>
      </Alert>}
    </div>
    {ActiveSheet && sheets && sheetAction && <ActiveSheet
      data={data}
      handlers={sheets}
      open
      onOpenChange={(open) => { if (!open) setSheetAction(null); }}
      onSuccess={(result) => setSheetSuccess({ action: sheetAction, result })}
      returnFocus={sheetTrigger}
      confirm={data.actions.find((action) => action.id === sheetAction)?.confirm}
    />}
  </>;
}
