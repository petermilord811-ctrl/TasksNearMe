/**
 * What tasks of one kind usually offer (completion plan 7.5, TaskRabbit-style "popular task types"): the middle
 * half of their budgets, or every budget when there are only a few, in whole dollars. Used by the board's task
 * type tiles; the input is the budgets the board itself shows, never a guess.
 */

/** At least this many budgets before the ends are trimmed to the middle half. */
export const SPREAD_TRIM_FROM = 4;

export interface BudgetSpread {
  lowCents: number;
  highCents: number;
}

const wholeDollars = (cents: number) => Math.round(cents / 100) * 100;

export function budgetSpread(budgetsCents: readonly number[]): BudgetSpread | undefined {
  const sorted = budgetsCents.filter((cents) => Number.isFinite(cents) && cents > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  if (sorted.length < SPREAD_TRIM_FROM) return { lowCents: wholeDollars(sorted[0]!), highCents: wholeDollars(sorted[sorted.length - 1]!) };
  return { lowCents: wholeDollars(quantile(sorted, 0.25)), highCents: wholeDollars(quantile(sorted, 0.75)) };
}

/** Linear between the two nearest budgets (Postgres's percentile_cont). */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  return sorted[below]! + (sorted[above]! - sorted[below]!) * (at - below);
}
