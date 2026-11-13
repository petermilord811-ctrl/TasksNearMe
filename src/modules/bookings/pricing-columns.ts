import type { PricingInput } from '@/contracts';

/**
 * Terms as columns and back, shared by rebooking proposals, regular visits and their bookings: a fixed price, or
 * an hourly rate with its estimate and cap.
 */

/** Stored terms → the pricing input. */
export const pricingOf = (row: { pricingType: string; priceCents: number | null; hourlyRateCents: number | null; estimatedHours: number | null; hoursCap: number | null }): PricingInput =>
  row.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: row.hourlyRateCents ?? 0, estimatedHours: row.estimatedHours ?? row.hoursCap ?? 1, hoursCap: row.hoursCap ?? 1 }
    : { type: 'fixed', priceCents: row.priceCents ?? 0 };

/** The pricing input → terms columns (`booking_terms`, `rebook_proposals`, `booking_series`). */
export const pricingColumns = (pricing: PricingInput) => ({
  pricingType: pricing.type,
  priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
  hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
  estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
  hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
});

/** The pricing input → a task's budget columns (a copied task carries the agreed terms). */
export const pricingColumnsForTask = (pricing: PricingInput) => ({
  pricingType: pricing.type,
  budgetCents: pricing.type === 'fixed' ? pricing.priceCents : null,
  hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
  estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
  hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
});
