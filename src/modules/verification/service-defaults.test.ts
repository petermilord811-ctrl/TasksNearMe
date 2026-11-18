import { describe, expect, it } from 'vitest';
import { categoryViews, setupServiceDefaults } from '@/fixtures';
import { serviceDefaultsFor } from './service-defaults';

describe('the pricing helper setup prefills (plan 9.11)', () => {
  it('is the low end of the typical range, in the category’s usual pricing', () => {
    expect(serviceDefaultsFor(categoryViews)).toEqual(setupServiceDefaults);
  });

  it('never goes under what a service may list', () => {
    // Moving help's $35 minimum is for a task: $17.50 an hour over its 2 hours, so its typical $32 an hour stands (aa's sweep S6).
    expect(serviceDefaultsFor(categoryViews)['moving-help']).toEqual({ pricingType: 'hourly', hourlyRateCents: 3200, minHours: 2 });
    // A typical range that starts lower starts at the least allowed.
    const [assembly, moving] = categoryViews;
    expect(serviceDefaultsFor([{ ...moving!, priceGuidance: { lowCents: 1500, highCents: 2500, unit: 'hour' } }])).toEqual({ 'moving-help': { pricingType: 'hourly', hourlyRateCents: 1750, minHours: 2 } });
    expect(serviceDefaultsFor([{ ...assembly!, priceGuidance: { lowCents: 2000, highCents: 4000, unit: 'item' } }])).toEqual({ 'furniture-assembly': { pricingType: 'fixed', fromPriceCents: 2500 } });
  });

  it('uses the minimum when the range is in another unit', () => {
    const [category] = categoryViews;
    expect(serviceDefaultsFor([{ ...category!, priceGuidance: { lowCents: 3000, highCents: 4000, unit: 'hour' } }])).toEqual({ 'furniture-assembly': { pricingType: 'fixed', fromPriceCents: 2500 } });
  });
});
