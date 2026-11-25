import { describe, expect, it } from 'vitest';
import { aiAssistOutcome, type ActionResult, type AiAssistResult } from '@/contracts';
import { priceRange, verdictOf } from './price-range';

/** "Check my price with AI" (2026-11-24): every number is the market's guide at the size AI read, rounded to $5. */

const furniture = { priceGuidance: { lowCents: 5000, highCents: 8000, unit: 'item' as const }, minPriceCents: 2500 };
const moving = { priceGuidance: { lowCents: 3200, highCents: 4000, unit: 'hour' as const }, minPriceCents: 3500, minHours: 2 };
const cleaning = { priceGuidance: { lowCents: 9000, highCents: 16000, unit: 'task' as const }, minPriceCents: 6000 };

describe('the fair range', () => {
  it("is the guide times the size, narrowed by how heavy the work is", () => {
    // Two items: $100–$160, typical keeps the middle 60%: $112–$148, rounded out to $110–$150.
    expect(priceRange(furniture, 2, 'typical')).toEqual({ lowCents: 11000, highCents: 15000, units: 2 });
    expect(priceRange(furniture, 2, 'light')).toEqual({ lowCents: 10000, highCents: 14000, units: 2 });
    expect(priceRange(furniture, 2, 'heavy')).toEqual({ lowCents: 12000, highCents: 16000, units: 2 });
  });

  it('counts at least the minimum hours, and a per-task price once whatever the size', () => {
    expect(priceRange(moving, 1, 'typical')).toEqual({ lowCents: 6500, highCents: 8000, units: 2 });
    expect(priceRange(cleaning, 5, 'typical')).toEqual({ lowCents: 10000, highCents: 15000, units: 1 });
  });

  it("never goes under the category's usual minimum", () => {
    const cheap = { priceGuidance: { lowCents: 1000, highCents: 1500, unit: 'item' as const }, minPriceCents: 4000 };
    expect(priceRange(cheap, 1, 'light')).toEqual({ lowCents: 4000, highCents: 4500, units: 1 });
  });
});

describe('where the typed price sits', () => {
  const range = { lowCents: 11000, highCents: 15000 };
  it('compares a fixed price, or the rate times the hours', () => {
    expect(verdictOf({ type: 'fixed', priceCents: 12000 }, range)).toEqual({ verdict: 'within', budgetCents: 12000 });
    expect(verdictOf({ type: 'fixed', priceCents: 6000 }, range)).toEqual({ verdict: 'below', budgetCents: 6000 });
    expect(verdictOf({ type: 'hourly', rateCents: 4000, estimatedHours: 5 }, range)).toEqual({ verdict: 'above', budgetCents: 20000 });
  });

  it('says nothing without a usable price', () => {
    expect(verdictOf(undefined, range)).toBeUndefined();
    expect(verdictOf({ type: 'fixed' }, range)).toBeUndefined();
    expect(verdictOf({ type: 'hourly', rateCents: 4000 }, range)).toBeUndefined();
    expect(verdictOf({ type: 'fixed', priceCents: 0 }, range)).toBeUndefined();
  });
});

describe('AI results', () => {
  it('are ActionResults, and read as drafted, prohibited, limited or unavailable', () => {
    const results: AiAssistResult<{ body: string }>[] = [
      { ok: true, code: 'drafted', value: { body: 'x' } },
      { ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } },
      { ok: false, code: 'validation_failed', fieldErrors: { body: ['too_long'] } },
      { ok: false, code: 'rate_limited', retryAt: '2026-11-24T10:00:00.000Z' },
      { ok: false, code: 'not_found' },
    ];
    const asActionResults: ActionResult[] = results;
    expect(asActionResults).toHaveLength(5);
    expect(results.map(aiAssistOutcome)).toEqual(['drafted', 'prohibited', 'unavailable', 'rate_limited', 'unavailable']);
  });
});
