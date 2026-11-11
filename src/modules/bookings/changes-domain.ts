import type { FieldErrorCode, PricingInput, ProposableChangeType, ProposeChangeInput } from '@/contracts';

/**
 * Pure rules for change requests (blueprint 03 §5): what can change when, how long a proposal stays open,
 * and the proposed terms from what a person sent.
 */

const HOUR = 3_600_000;

export const OPEN_CHANGE_STATUSES = ['proposed', 'accepted_pending_funding'] as const;

/** The terms a change works on. */
export interface ChangeTerms {
  pricingType: 'fixed' | 'hourly';
  priceCents: number | null;
  hourlyRateCents: number | null;
  estimatedHours: number | null;
  hoursCap: number | null;
  startAt: Date;
  scopeText: string;
  expenseAllowanceCents: number;
}

/** The work has started (checked in, or past the agreed start). */
export const workStarted = (status: string, startAt: Date, now: Date) => status === 'in_progress' || (status === 'confirmed' && now >= startAt);

/**
 * Before the work: everything can change. During it: not the start. The hours cap only for hourly work.
 * Nothing changes once the work was sent, or the booking ended.
 */
export function allowedChangeTypes(input: { status: string; pricingType: 'fixed' | 'hourly'; startAt: Date; now: Date }): ProposableChangeType[] {
  if (input.status !== 'confirmed' && input.status !== 'in_progress') return [];
  const types: ProposableChangeType[] = ['price', 'scope'];
  if (!workStarted(input.status, input.startAt, input.now)) types.push('schedule');
  if (input.pricingType === 'hourly') types.push('hours_cap');
  types.push('expense_allowance');
  return types;
}

/** A proposal expires at the start (before the work) or 24 h later (during it); waiting for the client's payment, 24 h. */
export function changeExpiresAt(kind: 'proposed' | 'pending_funding', input: { status: string; startAt: Date; now: Date }): Date {
  if (kind === 'pending_funding' || workStarted(input.status, input.startAt, input.now)) return new Date(input.now.getTime() + 24 * HOUR);
  return input.startAt;
}

export function pricingOf(terms: ChangeTerms): PricingInput {
  return terms.pricingType === 'fixed'
    ? { type: 'fixed', priceCents: terms.priceCents ?? 0 }
    : { type: 'hourly', rateCents: terms.hourlyRateCents ?? 0, estimatedHours: terms.estimatedHours ?? terms.hoursCap ?? 1, hoursCap: terms.hoursCap ?? 1 };
}

/**
 * The proposed terms: today's terms with the sent fields that are allowed now. Fields that aren't allowed
 * (or don't fit the pricing type) are errors; unchanged fields don't count as changes.
 */
export function proposedTerms(
  current: ChangeTerms,
  input: Omit<ProposeChangeInput, 'message'>,
  allowed: readonly ProposableChangeType[],
): { terms: ChangeTerms; types: ProposableChangeType[] } | { fieldErrors: Record<string, FieldErrorCode[]> } {
  const errors: Record<string, FieldErrorCode[]> = {};
  const next: ChangeTerms = { ...current };
  const types = new Set<ProposableChangeType>();
  const allow = (type: ProposableChangeType, field: string, fits = true) => {
    if (!allowed.includes(type) || !fits) errors[field] = ['invalid'];
    return allowed.includes(type) && fits;
  };
  if (input.priceCents !== undefined && allow('price', 'priceCents', current.pricingType === 'fixed') && input.priceCents !== current.priceCents) {
    next.priceCents = input.priceCents;
    types.add('price');
  }
  if (input.hourlyRateCents !== undefined && allow('price', 'hourlyRateCents', current.pricingType === 'hourly') && input.hourlyRateCents !== current.hourlyRateCents) {
    next.hourlyRateCents = input.hourlyRateCents;
    types.add('price');
  }
  if (input.hoursCap !== undefined && allow('hours_cap', 'hoursCap') && input.hoursCap !== current.hoursCap) {
    next.hoursCap = input.hoursCap;
    if ((next.estimatedHours ?? 0) > input.hoursCap) next.estimatedHours = input.hoursCap;
    types.add('hours_cap');
  }
  if (input.start !== undefined && allow('schedule', 'start')) {
    const start = new Date(input.start);
    if (start.getTime() !== current.startAt.getTime()) {
      next.startAt = start;
      types.add('schedule');
    }
  }
  if (input.scopeText !== undefined && allow('scope', 'scopeText') && input.scopeText.trim() !== current.scopeText.trim()) {
    next.scopeText = input.scopeText.trim();
    types.add('scope');
  }
  if (input.expenseAllowanceCents !== undefined && allow('expense_allowance', 'expenseAllowanceCents') && input.expenseAllowanceCents !== current.expenseAllowanceCents) {
    next.expenseAllowanceCents = input.expenseAllowanceCents;
    types.add('expense_allowance');
  }
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };
  if (types.size === 0) return { fieldErrors: { priceCents: ['required'] } };
  return { terms: next, types: [...types] };
}
