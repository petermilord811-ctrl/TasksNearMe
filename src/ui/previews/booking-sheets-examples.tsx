'use client';

import { useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type AppShellHandlers, type BookingSheetHandlers, type BookingView, type CancellationPreview } from '@/contracts';
import { deskCancelPreviewHelperLate, deskCancelPreviewPosterLate, fakeBookingHubHandlers, fakeBookingSheetHandlers, fakeHandler, jordanShell, mayaShell } from '@/fixtures';
import { BookingHubScreen } from '@/ui/screens/bookings/booking-hub-screen';
import { CancelBookingSheet, SafetyReportSheet } from '@/ui/screens/bookings/sheets';
import { Button } from '@/ui/primitives/button';
import { AppShell } from '@/ui/shells/app-shell';

const now = '2026-11-21T17:00:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function sheetHandlers(data: BookingView, preview?: CancellationPreview): BookingSheetHandlers {
  return {
    ...fakeBookingSheetHandlers,
    onPreviewCancel: async () => {
      await fakeHandler()(undefined);
      return preview ?? (data.viewerRole === 'helper' ? deskCancelPreviewHelperLate : deskCancelPreviewPosterLate);
    },
    onCancel: fakeHandler({ ok: true, code: 'canceled' }),
    onRunningLate: fakeHandler({ ok: true, code: 'updated' }),
    onReportNoShow: fakeHandler({ ok: true, code: 'canceled' }),
    onCantAccess: fakeHandler({ ok: true, code: 'updated' }),
    onSafetyReport: fakeHandler({ ok: true, code: 'submitted' }),
  };
}

export function BookingHubSheetExample({ data, at = now, unavailable = false }: { data: BookingView; at?: string; unavailable?: boolean }) {
  // Include the tabs here to exercise fixed booking actions above the mobile navigation.
  return <AppShell viewer={data.viewerRole === 'helper' ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="tabs">
    <BookingHubScreen data={data} handlers={fakeBookingHubHandlers} sheets={unavailable ? undefined : sheetHandlers(data)} now={at} />
  </AppShell>;
}

export type SheetProps = ComponentProps<typeof CancelBookingSheet>;
export type SheetOptions = Pick<SheetProps, 'initialPreview' | 'initialPreviewState' | 'initialPending' | 'initialResult' | 'initialValues'>;

export function SheetExample({ SheetComponent, data, options }: { SheetComponent: ComponentType<SheetProps>; data: BookingView; options: SheetOptions }) {
  const t = useTranslations('bookingSheets');
  const resultCopy = useTranslations('feedback');
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState<ActionResult>();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const handlers = sheetHandlers(data, options.initialPreview);
  if (options.initialResult && !options.initialResult.ok) {
    handlers.onCancel = fakeHandler(options.initialResult);
    handlers.onRunningLate = fakeHandler(options.initialResult);
    handlers.onReportNoShow = fakeHandler(options.initialResult);
    handlers.onCantAccess = fakeHandler(options.initialResult);
    handlers.onSafetyReport = fakeHandler(options.initialResult);
  }
  return <AppShell viewer={data.viewerRole === 'helper' ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.booking(data.id)} layout="tabs">
    <BookingHubScreen data={data} handlers={fakeBookingHubHandlers} sheets={handlers} now={now} />
    <div className="mx-auto mt-6 max-w-reading space-y-3">
      <Button ref={trigger} variant="outline" onClick={() => setOpen(true)}>{t('previews.open')}</Button>
      <div aria-live="polite">{result?.ok && <p className="rounded-lg border border-success/30 bg-card p-4">{SheetComponent === SafetyReportSheet ? t('safety.sent') : resultCopy(`success.${result.code}`)}</p>}</div>
    </div>
    {open && <SheetComponent data={data} handlers={handlers} open onOpenChange={setOpen} onSuccess={setResult} returnFocus={trigger} {...options} />}
  </AppShell>;
}
