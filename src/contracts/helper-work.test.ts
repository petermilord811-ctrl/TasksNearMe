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

  it('keeps the pricing type, the start inside the window, and the minimum price', () => {
    const rules = helperDeskWithOffer.offerRules;
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 2, hoursCap: 2 } })).toEqual({
      'pricing.type': 'invalid',
    });
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, startTime: '13:00' })).toEqual({ startTime: 'out_of_range' });
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, pricing: { type: 'fixed', priceCents: 2000 } })).toEqual({
      'pricing.priceCents': 'out_of_range',
    });
    expect(errorsOf(rules, { ...helperDeskWithOffer.offerDefaults, message: 'x'.repeat(501) })).toEqual({ message: 'too_long' });
  });

  it('hourly offers keep a cap that covers the estimate and the poster’s hours', () => {
    const rules = helperMovingHourly.offerRules;
    expect(
      errorsOf(rules, { ...helperMovingHourly.offerDefaults, pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 3 } }),
    ).toEqual({ 'pricing.hoursCap': 'out_of_range' });
  });
});
