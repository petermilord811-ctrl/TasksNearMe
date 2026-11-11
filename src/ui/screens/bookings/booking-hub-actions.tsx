'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { routes, type ActionResult, type BookingActionId, type BookingHubHandlers, type BookingView } from '@/contracts';
import { formatDateTime } from '@/shared/format';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';

export interface BookingHubActionsProps {
  data: BookingView;
  handlers: BookingHubHandlers;
  /** Preview-only snapshots, without submitting an action on mount. */
  initialResult?: ActionResult;
  initialPending?: BookingActionId;
}

export function BookingHubActions({ data, handlers, initialResult, initialPending }: BookingHubActionsProps) {
  const t = useTranslations('bookingHub');
  const feedback = useTranslations('feedback');
  const forms = useTranslations('forms');
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);

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
      if (!(target instanceof HTMLElement) || bar.contains(target) || getComputedStyle(bar).position !== 'fixed') return;
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

  return <ActionBar
    actions={data.actions}
    mobileFixed
    barRef={barRef}
    initialResult={initialResult}
    initialPending={initialPending}
    getActionLink={(action) => action === 'add_to_calendar' ? { href: routes.app.bookingCalendar(data.id), download: true } : undefined}
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
  />;
}
