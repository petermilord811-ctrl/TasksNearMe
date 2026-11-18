import { describe, expect, it } from 'vitest';
import { categoryViews, setupServiceDefaults } from '@/fixtures';
import { serviceDefaultsFor } from './service-defaults';

describe('the pricing helper setup prefills (plan 9.11)', () => {
  it('is the low end of the typical range, in the category’s usual pricing', () => {
    expect(serviceDefaultsFor(categoryViews)).toEqual(setupServiceDefaults);
  });

  it('never goes under the category minimum', () => {
    // Moving help's typical range starts at $32/h, under its $35/h minimum.
    expect(serviceDefaultsFor(categoryViews)['moving-help']).toEqual({ pricingType: 'hourly', hourlyRateCents: 3500, minHours: 2 });
  });

  it('uses the minimum when the range is in another unit', () => {
    const [category] = categoryViews;
    expect(serviceDefaultsFor([{ ...category!, priceGuidance: { lowCents: 3000, highCents: 4000, unit: 'hour' } }])).toEqual({ 'furniture-assembly': { pricingType: 'fixed', fromPriceCents: 2500 } });
  });
});
