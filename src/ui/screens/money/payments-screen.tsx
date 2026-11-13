import Link from 'next/link';
import { ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type PaymentMethodHandlers, type PaymentsPageData, type ReceiptRow } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
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
  const { formatDate } = useFormat();
  const t = useTranslations('paymentsPage');
  const status = usePaymentStatus(receipt.status);
  // The whole row opens the receipt (the title's link covers it); the status sits on the right.
  return <li className="group relative flex flex-col gap-2 p-4 transition-colors duration-200 hover:bg-foreground/[0.03] sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6 sm:py-5 dark:hover:bg-white/[0.03]">
    <div className="min-w-0 space-y-1">
      <h3 className="font-display text-[17px]/6 font-semibold tracking-[-0.01em]"><Link href={routes.app.receipt(receipt.bookingId)} className="inline-flex min-h-11 items-center break-words underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:text-primary hover:underline focus-visible:outline-offset-2">{receipt.title}</Link></h3>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
        <span>{t('helper', { name: receipt.helper.displayName })}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={receipt.paidAt} className="tabular-nums">{t('paidAt', { date: formatDate(receipt.paidAt) })}</time>
      </p>
      <p className="pt-1 text-sm leading-6 font-medium tabular-nums">{t('amounts', {
        charged: formatMoney(receipt.chargedCents), refunded: formatMoney(receipt.refundedCents), net: formatMoney(receipt.netCents),
        hasTip: receipt.tipCents ? 'yes' : 'no', tip: formatMoney(receipt.tipCents ?? 0),
      })}</p>
    </div>
    <div className="relative shrink-0 self-start"><StatusBadge {...status} /></div>
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
      <h2 id="payments-receipts" className="font-display text-xl font-semibold tracking-[-0.015em] lg:text-[22px]">{t('receipts')}</h2>
      {data.receipts.length ? <ul className="divide-y divide-foreground/[0.07] overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] dark:divide-white/[0.06]">
        {data.receipts.map((receipt) => <PaymentReceiptRow key={receipt.bookingId} receipt={receipt} />)}
      </ul> : <EmptyState title={t('emptyTitle')} body={t('emptyBody')} icon={<ReceiptText className="size-6" />} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
    </section>
    <PaymentCards methods={data.methods} newCard={data.newCard} handlers={handlers} preview={cardsPreview} />
  </div>;
}
