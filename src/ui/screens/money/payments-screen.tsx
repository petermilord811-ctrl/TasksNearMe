import Link from 'next/link';
import { ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type PaymentMethodHandlers, type PaymentsPageData, type ReceiptRow } from '@/contracts';
import { formatDate, formatMoney } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { usePaymentStatus } from '@/ui/components/status/use-status';
import { PaymentCards, type PaymentCardsPreviewState } from './payment-cards';

export interface PaymentsScreenProps {
  data: PaymentsPageData;
  handlers: PaymentMethodHandlers;
  now: ISODateTime;
}

function PaymentReceiptRow({ receipt }: { receipt: ReceiptRow }) {
  const t = useTranslations('paymentsPage');
  const status = usePaymentStatus(receipt.status);
  return <li className="space-y-3 p-4 sm:p-6">
    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold"><Link href={routes.app.receipt(receipt.bookingId)} className="inline-flex min-h-11 items-center break-words text-primary underline-offset-4 hover:underline">{receipt.title}</Link></h3>
        <p className="text-sm text-muted-foreground">{t('helper', { name: receipt.helper.displayName })}</p>
      </div>
      <StatusBadge {...status} />
    </div>
    <p className="text-sm tabular-nums text-muted-foreground"><time dateTime={receipt.paidAt}>{t('paidAt', { date: formatDate(receipt.paidAt) })}</time></p>
    <p className="text-sm leading-6 font-medium tabular-nums">{t('amounts', {
      charged: formatMoney(receipt.chargedCents), refunded: formatMoney(receipt.refundedCents), net: formatMoney(receipt.netCents),
    })}</p>
  </li>;
}

export function PaymentsScreen(props: PaymentsScreenProps) {
  return <PaymentsContent {...props} />;
}

/** Preview seeds stay separate from the route-facing screen's contract. */
export function PaymentsContent({ data, handlers, cardsPreview }: PaymentsScreenProps & { cardsPreview?: PaymentCardsPreviewState }) {
  const t = useTranslations('paymentsPage');
  return <div className="mx-auto w-full max-w-content space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <section aria-labelledby="payments-receipts" className="space-y-4">
      <h2 id="payments-receipts" className="text-xl font-semibold lg:text-[22px]">{t('receipts')}</h2>
      {data.receipts.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
        {data.receipts.map((receipt) => <PaymentReceiptRow key={receipt.bookingId} receipt={receipt} />)}
      </ul> : <EmptyState title={t('emptyTitle')} body={t('emptyBody')} icon={<ReceiptText className="size-6" />} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
    </section>
    <PaymentCards methods={data.methods} newCard={data.newCard} handlers={handlers} preview={cardsPreview} />
  </div>;
}
