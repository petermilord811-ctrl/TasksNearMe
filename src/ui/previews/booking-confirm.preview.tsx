import type { ComponentProps } from 'react';
import {
  ACTION_ERROR_CODES, BOOKING_UNAVAILABLE_REASONS, CARD_BRANDS, routes,
  type ActionResult, type AppShellHandlers, type BookingConfirmHandlers,
  type BookingConfirmPageData, type PaymentAttemptResult, type PreviewEntry,
} from '@/contracts';
import {
  deskConfirmData, deskConfirmDeclinedData, deskConfirmInsufficientFundsData, deskConfirmPaysLaterData,
  deskConfirmNewCardData, deskConfirmUnavailableData, fakeBookingConfirmHandlers,
  fakeHandler, mayaPaymentPanel, mayaShell, movingConfirmHourlyData,
  noSavedCardsPaymentPanel, remoteConfirmData,
} from '@/fixtures';
import { CancellationSummary } from '@/ui/components/money/cancellation-summary';
import { PaymentMethodLabel } from '@/ui/components/payments';
import { BookingConfirmContent, BookingConfirmScreen } from '@/ui/screens/bookings/booking-confirm-screen';
import { AppShell } from '@/ui/shells/app-shell';
import { BankVerificationDialogPreview, PaymentMethodPickerPreview } from './booking-confirm-examples';
import copy from '../../../messages/en/ui/bookingConfirm.json';

const now = '2026-11-17T15:01:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

type ContentOptions = Pick<ComponentProps<typeof BookingConfirmContent>, 'initialResult' | 'initialPending'> & { handlers?: BookingConfirmHandlers };

function screenPreview(id: string, title: string, data: BookingConfirmPageData, options?: ContentOptions, shellLayout: 'flow' | 'tabs' = 'flow'): PreviewEntry {
  return {
    id: `screen-booking-confirm/${id}`,
    title,
    group: copy.previews.group,
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.confirmOffer(data.task.id, data.offer.id)} layout={shellLayout}>
      {options
        ? <BookingConfirmContent data={data} handlers={fakeBookingConfirmHandlers} now={now} {...options} />
        : <BookingConfirmScreen data={data} handlers={fakeBookingConfirmHandlers} now={now} />}
    </AppShell>,
  };
}

const verification: PaymentAttemptResult = {
  ok: false,
  code: 'requires_bank_verification',
  verification: { paymentId: 'pay_desk_2', kind: 'dev' },
};

export const bookingConfirmPreviews: PreviewEntry[] = [
  screenPreview('default', copy.previews.default, deskConfirmData),
  screenPreview('default-with-tabs', copy.previews.default, deskConfirmData, undefined, 'tabs'),
  screenPreview('new-card', copy.previews['new-card'], deskConfirmNewCardData),
  screenPreview('declined', copy.previews.declined, deskConfirmDeclinedData),
  screenPreview('insufficient-funds', copy.previews['insufficient-funds'], deskConfirmInsufficientFundsData),
  screenPreview('hourly', copy.previews.hourly, movingConfirmHourlyData),
  screenPreview('remote', copy.previews.remote, remoteConfirmData),
  screenPreview('pays-later', copy.previews.paysLater, deskConfirmPaysLaterData),
  screenPreview('pending-no-failure', copy.previews['pending-no-failure'], {
    ...deskConfirmData,
    pending: { bookingId: deskConfirmDeclinedData.pending!.bookingId, expiresAt: deskConfirmDeclinedData.pending!.expiresAt },
  }),
  screenPreview('bank-verification', copy.previews['bank-verification'], deskConfirmNewCardData, {
    initialResult: verification,
    handlers: { ...fakeBookingConfirmHandlers, onConfirm: async () => {
      await fakeHandler()(undefined);
      return verification;
    } },
  }),
  ...BOOKING_UNAVAILABLE_REASONS.map((reason) => screenPreview(
    `unavailable-${reason.replaceAll('_', '-')}`,
    copy.previews.unavailable[reason],
    deskConfirmUnavailableData[reason],
  )),
  ...ACTION_ERROR_CODES.map((code) => {
    const result: ActionResult = {
      ok: false,
      code,
      ...(code === 'rate_limited' ? { retryAt: '2026-11-17T15:05:00.000Z' } : {}),
      ...(code === 'validation_failed' ? { fieldErrors: { acceptTerms: ['must_accept' as const] } } : {}),
    };
    return screenPreview(`result-${code.replaceAll('_', '-')}`, copy.previews.results[code], deskConfirmData, {
      initialResult: result,
      handlers: { ...fakeBookingConfirmHandlers, onConfirm: fakeHandler(result) },
    });
  }),
  screenPreview('submitting', copy.previews.submitting, deskConfirmData, {
    initialPending: true,
    handlers: { ...fakeBookingConfirmHandlers, onConfirm: () => new Promise(() => {}) },
  }),
  {
    id: 'component-payment-method-picker/saved', group: copy.previews.group, title: copy.previews['payment-picker-saved'],
    render: () => <PaymentMethodPickerPreview panel={mayaPaymentPanel} />,
  },
  {
    id: 'component-payment-method-picker/new-card', group: copy.previews.group, title: copy.previews['payment-picker-new-card'],
    render: () => <PaymentMethodPickerPreview panel={noSavedCardsPaymentPanel} />,
  },
  {
    id: 'component-payment-method-label/all-brands', group: copy.previews.group, title: copy.previews['payment-labels'],
    render: () => <ul className="space-y-3 rounded-xl border bg-card p-card shadow-card">
      {CARD_BRANDS.map((brand) => <li key={brand}><PaymentMethodLabel method={{ brand, last4: mayaPaymentPanel.methods[0].last4 }} /></li>)}
      <li><PaymentMethodLabel method={{ brand: 'apple_pay' }} /></li>
      <li><PaymentMethodLabel method={{ brand: 'google_pay' }} /></li>
    </ul>,
  },
  {
    id: 'component-cancellation-summary/fixed', group: copy.previews.group, title: copy.previews['cancellation-fixed'],
    render: () => <CancellationSummary policy={deskConfirmData.cancellation} helperName={deskConfirmData.offer.helper.displayName} />,
  },
  {
    id: 'component-cancellation-summary/hourly', group: copy.previews.group, title: copy.previews['cancellation-hourly'],
    render: () => <CancellationSummary policy={movingConfirmHourlyData.cancellation} helperName={movingConfirmHourlyData.offer.helper.displayName} />,
  },
  {
    id: 'component-bank-verification-dialog/default', group: copy.previews.group, title: copy.previews['bank-dialog'],
    render: () => <BankVerificationDialogPreview />,
  },
];
