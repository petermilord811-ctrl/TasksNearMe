import type { CategoryView, Cents, PriceCheckInput, PriceVerdict } from '@/contracts';
import type { JobEffort } from '@/integrations/ai/price-sizer';

/**
 * The numbers of "Check my price with AI" (2026-11-24): the market's price guide at the size AI read, and where the typed
 * price sits. Pure: no model and no database (src/modules/assist/price-check.ts runs them).
 */

export const roundDown = (cents: number) => Math.max(500, Math.floor(cents / 500) * 500);
export const roundUp = (cents: number) => Math.ceil(cents / 500) * 500;

/**
 * The fair range at this size: the guide's low and high times the units (one for a per-task price), narrowed toward the
 * low end for light work and the high end for heavy work, never under the category's usual minimum (or its minimum
 * hours), rounded to $5.
 */
export function priceRange(category: Pick<CategoryView, 'priceGuidance' | 'minPriceCents' | 'minHours'>, units: number, effort: JobEffort): { lowCents: Cents; highCents: Cents; units: number } {
  const { lowCents, highCents, unit } = category.priceGuidance;
  const size = unit === 'task' ? 1 : unit === 'hour' ? Math.max(units, category.minHours ?? 0) : units;
  const base = { low: lowCents * size, high: Math.max(highCents, lowCents) * size };
  const span = base.high - base.low;
  const [from, to] = effort === 'light' ? [0, 0.6] : effort === 'heavy' ? [0.4, 1] : [0.2, 0.8];
  const low = Math.max(base.low + span * from, category.minPriceCents);
  const high = Math.max(base.low + span * to, low);
  const rounded = { lowCents: roundDown(low), highCents: roundUp(high) };
  return { ...rounded, highCents: Math.max(rounded.highCents, rounded.lowCents + 500), units: size };
}

/** The budget typed so far as a total (a fixed price, or the rate times the hours), against the range. */
export function verdictOf(budget: PriceCheckInput['budget'], range: { lowCents: Cents; highCents: Cents }): { verdict: PriceVerdict; budgetCents: Cents } | undefined {
  if (!budget) return undefined;
  const total = budget.type === 'fixed'
    ? budget.priceCents
    : budget.rateCents !== undefined && budget.estimatedHours !== undefined ? Math.round(budget.rateCents * budget.estimatedHours) : undefined;
  if (total === undefined || !Number.isFinite(total) || total <= 0) return undefined;
  return { verdict: total < range.lowCents ? 'below' : total > range.highCents ? 'above' : 'within', budgetCents: total };
}
