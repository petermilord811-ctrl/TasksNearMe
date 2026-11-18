import { ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type PaymentMethodHandlers, type PaymentsPageData, type ReceiptRow } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { CompactList, CompactRow, DayTile, ListGroupLabel, RowFact, RowMoney } from '@/ui/components/layout/compact-list';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { usePaymentStatus } from '@/ui/components/status/use-status';
import { PaymentCards, type PaymentCardsPreviewState } from './payment-cards';

export interface PaymentsScreenProps {
  data: PaymentsPageData;
  handlers: PaymentMethodHandlers;
  now: ISODateTime;
}

/** How many receipts show before "Show older receipts" (the newest ones). */
const RECENT_RECEIPTS = 5;

/**
 * One receipt as a compact row: the day it was paid, the task (the row opens the receipt), its status and helper,
 * and what the client paid. A refund or a tip shows only when there is one (audit L30).
 */
function PaymentReceiptRow({ receipt }: { receipt: ReceiptRow }) {
  const t = useTranslations('paymentsPage');
  const status = usePaymentStatus(receipt.status);
  const net = formatMoney(receipt.netCents);
  return <li>
    <CompactRow
      titleId={`receipt-${receipt.bookingId}`}
      title={receipt.title}
      href={routes.app.receipt(receipt.bookingId)}
      leading={<DayTile at={receipt.paidAt} />}
      facts={<>
        <StatusBadge size="sm" {...status} />
        <span>{t('helper', { name: receipt.helper.displayName })}</span>
        {receipt.refundedCents > 0 && <RowFact className="tabular-nums">{t('chargedRefunded', { charged: formatMoney(receipt.chargedCents), refunded: formatMoney(receipt.refundedCents) })}</RowFact>}
        {receipt.tipCents ? <RowFact className="tabular-nums">{t('tip', { tip: formatMoney(receipt.tipCents) })}</RowFact> : null}
      </>}
      trailing={<RowMoney caption={t('youPaid')} amount={net} />}
      trailingInline={net}
    />
  </li>;
}

/** Receipts by the month they were paid, newest first. */
function ReceiptMonths({ receipts, idPrefix }: { receipts: ReceiptRow[]; idPrefix: string }) {
  const { dayKey, formatMonthYear } = useFormat();
  const months: { key: string; items: ReceiptRow[] }[] = [];
  for (const receipt of receipts) {
    const key = dayKey(receipt.paidAt).slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.items.push(receipt);
    else months.push({ key, items: [receipt] });
  }
  return <div className="space-y-5">{months.map((month) => <section key={month.key} aria-labelledby={`${idPrefix}-${month.key}`} className="space-y-2">
    <ListGroupLabel id={`${idPrefix}-${month.key}`} level={3}>{formatMonthYear(month.items[0]!.paidAt)}</ListGroupLabel>
    <CompactList>{month.items.map((receipt) => <PaymentReceiptRow key={receipt.bookingId} receipt={receipt} />)}</CompactList>
  </section>)}</div>;
}

export function PaymentsScreen(props: PaymentsScreenProps) {
  return <PaymentsContent {...props} />;
}

/**
 * Saved cards first (they're short), then the receipts by month: the newest few, and the rest one tap away (audit
 * M36). Preview seeds stay separate from the route-facing screen's contract.
 */
export function PaymentsContent({ data, handlers, cardsPreview }: PaymentsScreenProps & { cardsPreview?: PaymentCardsPreviewState }) {
  const t = useTranslations('paymentsPage');
  const { dayKey } = useFormat();
  // The newest few, and the rest of the last one's month with them: a month cut in two would get its heading twice,
  // once above the newest and again under "Show older receipts" (sweep).
  const monthOf = (receipt: ReceiptRow) => dayKey(receipt.paidAt).slice(0, 7);
  let cut = Math.min(RECENT_RECEIPTS, data.receipts.length);
  const lastShown = data.receipts[cut - 1];
  while (lastShown && cut < data.receipts.length && monthOf(data.receipts[cut]!) === monthOf(lastShown)) cut += 1;
  const recent = data.receipts.slice(0, cut);
  const older = data.receipts.slice(cut);
  return <div className="mx-auto w-full max-w-content space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <PaymentCards methods={data.methods} newCard={data.newCard} handlers={handlers} preview={cardsPreview} />
    <section aria-labelledby="payments-receipts" className="space-y-4">
      <h2 id="payments-receipts" className="font-display text-xl font-semibold tracking-[-0.015em] lg:text-[22px]">{t('receipts')}</h2>
      {data.receipts.length ? <div className="space-y-5">
        <ReceiptMonths receipts={recent} idPrefix="receipts-recent" />
        {older.length > 0 && <details className="group space-y-5">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-foreground/[0.14] bg-card px-5 text-sm font-medium shadow-[0_1px_2px_rgb(23_18_14/0.05)] transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-white/[0.12] dark:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{t('showOlder', { count: older.length })}</span>
            <span className="hidden group-open:inline">{t('hideOlder')}</span>
          </summary>
          <ReceiptMonths receipts={older} idPrefix="receipts-older" />
        </details>}
      </div> : <EmptyState title={t('emptyTitle')} body={t('emptyBody')} icon={<ReceiptText className="size-6" />} action={{ label: t('postTask'), href: routes.app.newTask() }} />}
    </section>
  </div>;
}
