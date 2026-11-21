'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { AddressSuggestion, Cents, PriceBreakdown, PricingInput } from '@/contracts';
import { GEO_STAND_IN_COOKIE, wantsGeoStandIn } from '@/integrations/geocoding';
import { limitAddress } from '@/modules/accounts/sign-in/server';
import { DEFAULT_MARKET_SLUG } from '@/modules/markets/default-market';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { markets } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { isPricingInput } from './pricing-input';
import { sampleAddressTaskPosting, taskPosting } from './server';

/**
 * Drafting a task before having an account (/post, visitor-to-first-post walk, J-V5). Only these two run signed out,
 * each rate-limited per address (tests/unit/no-session-actions lists them with that reason): the address search and
 * the price quote. Photos and "Rewrite with AI" wait for the account. Always the market new accounts start in, never
 * one the caller names.
 */

/** Each search is one Mapbox request: enough for typing an address or two, not for a script. */
const SIGNED_OUT_ADDRESS_SEARCH_RULE = { limit: 60, windowSeconds: 10 * 60 };
const SIGNED_OUT_QUOTE_RULE = { limit: 120, windowSeconds: 10 * 60 };

export async function searchTaskAddressesSignedOut(input: { query: string }): Promise<AddressSuggestion[]> {
  const query = String(input?.query ?? '').slice(0, 120);
  if (query.trim().length < 3) return [];
  const address = await limitAddress();
  if (address) {
    const limited = await consumeRateLimit(db, `address-search:ip:${address}`, SIGNED_OUT_ADDRESS_SEARCH_RULE);
    // A failed search reads as "Address search is unavailable. Try again in a moment."
    if (!limited.ok) throw new Error('Too many address searches; try again in a few minutes.');
  }
  const standIn = wantsGeoStandIn((await cookies()).get(GEO_STAND_IN_COOKIE)?.value);
  const posting = standIn && sampleAddressTaskPosting ? sampleAddressTaskPosting : taskPosting;
  return posting.guestSearchAddresses(DEFAULT_MARKET_SLUG, query);
}

export async function quoteTaskPriceSignedOut(input: { budget: PricingInput; expenseAllowanceCents: Cents }): Promise<PriceBreakdown> {
  const address = await limitAddress();
  if (address) {
    const limited = await consumeRateLimit(db, `quote:ip:${address}`, SIGNED_OUT_QUOTE_RULE);
    if (!limited.ok) throw new Error('Too many price quotes; try again in a few minutes.');
  }
  const [market] = await db.select({ id: markets.id }).from(markets).where(eq(markets.slug, DEFAULT_MARKET_SLUG)).limit(1);
  const policy = market ? await getPublishedPolicy(market.id) : null;
  if (!policy || !isPricingInput(input?.budget)) throw new Error('Cannot quote this budget.');
  const allowance = Number.isInteger(input.expenseAllowanceCents) && input.expenseAllowanceCents > 0 ? input.expenseAllowanceCents : 0;
  return quoteBreakdown(policy.fees, input.budget, { expenseAllowanceCents: allowance });
}
