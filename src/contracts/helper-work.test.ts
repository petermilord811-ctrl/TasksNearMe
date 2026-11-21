import { describe, expect, it } from 'vitest';
import { helperDeskWithOffer, helperMovingHourly, helperYardNoOffer } from '@/fixtures';
import { createOfferInputSchema } from './helper-work';

function errorsOf(rules: Parameters<typeof createOfferInputSchema>[0], input: unknown): Record<string, string> {
  const result = createOfferInputSchema(rules).safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join('.')] ??= issue.message;
  return errors;
}

describe('offer form schema', () => {
  it('accepts every prefilled offer', () => {
    for (const view of [helperDeskWithOffer, helperYardNoOffer, helperMovingHourly]) {
      expect(errorsOf(view.offerRules, view.offerDefaults)).toEqual({});
    }
  });

  it('keeps the pricing type and the start inside the window, and takes a price under the category minimum', () => {
    const rules = helperDeskWithOffer.offerRules;
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 2 } })).toEqual({
      'pricing.type': 'invalid',
    });
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, startTime: '13:00' })).toEqual({ startTime: 'out_of_range' });
    // As on the task (owner, 2026-11-21): the form notes a low price, the schema takes it.
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, pricing: { type: 'fixed', priceCents: 2000 } })).toEqual({});
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, message: 'x'.repeat(501) })).toEqual({ message: 'too_long' });
  });

  it('caps prices and hours as posting does (security review 2026-11-20)', () => {
    expect(errorsOf(helperDeskWithOffer.offerRules, { ...helperDeskWithOffer.offerDefaults, pricing: { type: 'fixed', priceCents: 10_000_001 } })).toEqual({
      'pricing.priceCents': 'out_of_range',
    });
    const hourly = helperMovingHourly.offerDefaults.pricing;
    if (hourly.type !== 'hourly') throw new Error('The moving fixture is hourly');
    expect(errorsOf(helperMovingHourly.offerRules, { ...helperMovingHourly.offerDefaults, pricing: { ...hourly, rateCents: 100_001 } })).toEqual({
      'pricing.rateCents': 'out_of_range',
    });
    expect(errorsOf(helperMovingHourly.offerRules, { ...helperMovingHourly.offerDefaults, pricing: { ...hourly, estimatedHours: 25, hoursCap: 25 } })).toEqual({
      'pricing.estimatedHours': 'out_of_range',
      'pricing.hoursCap': 'out_of_range',
    });
  });

  it('hourly offers keep a cap that covers the estimate and the poster’s hours', () => {
    const rules = helperMovingHourly.offerRules;
    expect(
      errorsOf(rules, { ...helperMovingHourly.offerDefaults, pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 3 } }),
    ).toEqual({ 'pricing.hoursCap': 'out_of_range' });
  });
});
