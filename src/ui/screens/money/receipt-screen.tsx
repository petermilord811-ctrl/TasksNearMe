import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type ReceiptLine, type ReceiptPageData } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Money } from '@/ui/components/money/money';
import { PriceBreakdown } from '@/ui/components/money/price-breakdown';
import { PaymentMethodLabel } from '@/ui/components/payments';
import { PrintReceiptButton } from './print-receipt-button';

const refundReasons = ['cancellation', 'unused_cap', 'unused_allowance', 'change_decrease', 'dispute_settlement', 'goodwill', 'poster_credit'] as const;

function ReceiptActivity({ line }: { line: ReceiptLine }) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('receipt');
  const reason = refundReasons.find((value) => value === line.reason) ?? 'other';
  return <li className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
    <div className="min-w-0 space-y-1">
      <p className="font-medium">{t(line.kind)}</p>
      {line.kind === 'refund' && <p className="text-sm">{t(`refundReasons.${reason}`)}</p>}
      <time dateTime={line.at} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(line.at)}</time>
      {line.method && <p className="text-sm text-muted-foreground"><PaymentMethodLabel method={line.method} /></p>}
    </div>
    <Money cents={line.amountCents} />
  </li>;
}

export function ReceiptScreen({ data }: { data: ReceiptPageData }) {
  const { formatDate, formatDateTime } = useFormat();
  const t = useTranslations('receipt');
  return <article data-print-receipt className="mx-auto w-full max-w-reading space-y-6">
    <div className="space-y-3">
      <p className="font-heading text-lg font-bold text-primary">{t('brand')}</p>
      <PageHeader title={t('title')}><PrintReceiptButton /></PageHeader>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{t('number')}</dt><dd className="break-words font-medium tabular-nums">{data.receiptNumber}</dd></div>
        <div><dt className="text-muted-foreground">{t('issued')}</dt><dd><time dateTime={data.issuedAt} className="tabular-nums">{formatDate(data.issuedAt, { withYear: true })}</time></dd></div>
      </dl>
    </div>
    <section aria-label={data.booking.title} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold sm:text-[22px]/7.5"><Link href={routes.app.booking(data.booking.id)} className="inline-flex min-h-11 items-center rounded-md text-primary underline underline-offset-4">{data.booking.title}</Link></h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">{t('helper')}</dt><dd className="font-medium">{data.helper.displayName}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{t('agreedStart')}</dt><dd><time dateTime={data.booking.start} className="tabular-nums">{formatDateTime(data.booking.start)}</time></dd></div>
      </dl>
    </section>
    <PriceBreakdown breakdown={data.breakdown} variant="poster" title={t('breakdown')} />
    <section aria-label={t('activity')} className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-4 shadow-card sm:p-6">
      <h2 className="font-heading text-xl/7 font-semibold sm:text-[22px]/7.5">{t('activity')}</h2>
      <ul className="divide-y">{data.lines.map((line) => <ReceiptActivity key={line.id} line={line} />)}</ul>
      <dl className="border-t pt-4"><div className="flex flex-wrap items-baseline justify-between gap-3"><dt className="font-semibold">{t('net')}</dt><dd><Money cents={data.netCents} size="lg" /></dd></div></dl>
    </section>
  </article>;
}
