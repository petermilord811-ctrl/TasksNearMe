import type { PricingInput } from '@/contracts';

/** A budget the fee engine can quote: a whole-cent fixed price, or an hourly rate with its hours (at most a day). */
export function isPricingInput(value: unknown): value is PricingInput {
  const budget = value as PricingInput | undefined;
  if (!budget) return false;
  if (budget.type === 'fixed') return Number.isInteger(budget.priceCents) && budget.priceCents > 0;
  return (
    budget.type === 'hourly' &&
    Number.isInteger(budget.rateCents) &&
    budget.rateCents > 0 &&
    budget.hoursCap > 0 &&
    budget.hoursCap <= 24 &&
    budget.estimatedHours > 0
  );
}
