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

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * A price in marketing copy (typical prices, ranges): whole dollars without cents ("$50"), and cents only when there
 * are some ("$52.50"). Breakdowns and receipts keep `formatMoney`'s two decimals (audit L20, 2026-11-18).
 */
export function formatMoneyShort(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new TypeError(`formatMoneyShort expects cents >= 0, received ${cents}`);
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : formatMoney(cents);
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

/**
 * What someone typed into a money field → integer cents, or null when it isn't an amount.
 * "60" → 6000, "$1,234.5" → 123450, "12.345" → null (more than two decimals), "-5" → null.
 */
export function parseMoneyInput(input: string): Cents | null {
  const cleaned = input.trim().replace(/^\$\s*/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Integer cents → the plain number a money input shows: 6000 → "60", 12350 → "123.50". */
export function formatMoneyInput(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new TypeError(`formatMoneyInput expects cents >= 0, received ${cents}`);
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}
