import { describe, expect, it } from 'vitest';
import type { EarningsPageData } from '@/contracts';
import { deskReceiptPageData, deskSimpleReceiptPageData, earningsFirstPayoutData, jordanEarningsPageData, mayaPaymentsPageData } from './earnings';

const sum = (data: EarningsPageData, statuses: string[]) =>
  data.rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row.amountCents, 0);

describe('money fixtures', () => {
  it.each([jordanEarningsPageData, earningsFirstPayoutData])('earnings totals add up from the rows', (data) => {
    expect(data.totals.upcomingCents).toBe(sum(data, ['not_due', 'on_hold', 'scheduled']));
    expect(data.totals.onTheWayCents).toBe(sum(data, ['transferred']));
    expect(data.totals.paidThisYearCents).toBe(sum(data, ['paid_out']));
  });

  it('receipts net out their charges and refunds', () => {
    for (const row of mayaPaymentsPageData.receipts) expect(row.netCents).toBe(row.chargedCents - row.refundedCents);
    for (const receipt of [deskReceiptPageData, deskSimpleReceiptPageData]) {
      const net = receipt.lines.reduce((total, line) => total + (line.kind === 'charge' ? line.amountCents : -line.amountCents), 0);
      expect(receipt.netCents).toBe(net);
      expect(receipt.netCents).toBe(receipt.breakdown.posterTotalCents);
    }
  });
});
