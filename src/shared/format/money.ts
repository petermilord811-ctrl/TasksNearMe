import type { Cents } from '@/contracts/common';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MINUS_SIGN = '−';

export interface FormatMoneyOptions {
  /** "always" prefixes positive amounts with "+" (useful for deltas). Default "auto". */
  signDisplay?: 'auto' | 'always';
}

/**
 * Formats integer cents as US dollars with two decimals and a true minus sign:
 * 6600 → "$66.00", -600 → "−$6.00", with signDisplay "always": 2200 → "+$22.00".
 */
export function formatMoney(cents: Cents, options: FormatMoneyOptions = {}): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatMoney expects integer cents, received ${cents}`);
  }
  const formatted = usd.format(Math.abs(cents) / 100);
  if (cents < 0) return `${MINUS_SIGN}${formatted}`;
  if (cents > 0 && options.signDisplay === 'always') return `+${formatted}`;
  return formatted;
}
