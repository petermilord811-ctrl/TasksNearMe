'use server';

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { CategorySlug, LandingAiSuggestResult } from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeTaskDrafter } from '@/integrations/ai/task-drafter';
import { limitAddress } from '@/modules/accounts/sign-in/server';
import { DEFAULT_MARKET_SLUG, findPublicMarket, getFlags } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { taskDrafter } from '@/modules/tasks/server';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { LANDING_AI_PER_DAY, LANDING_AI_PER_VISITOR, suggestLandingDraft } from './landing-ai';

/**
 * The landing page's "Write it with AI" for signed-out visitors (`LandingHandlers.onSuggestWithAi`). The checks and
 * the cost guard live in `landing-ai.ts`. Visitors are counted by a hash of their IP (from the proxy-aware
 * `limitAddress`, an IPv6 address by its /64), so no address is stored; their words are passed to the drafter and nowhere else.
 */
export async function suggestTaskWithAi(input: { text: string; category: CategorySlug }): Promise<LandingAiSuggestResult> {
  // Tests ask for the rule-based stand-in, so they never reach Claude where a key is set (never honored in production).
  const standIn = wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
  const drafter = taskDrafter ? (standIn ? createFakeTaskDrafter() : taskDrafter) : null;
  const visitor = createHash('sha256').update(`landing-ai:${(await limitAddress()) ?? 'unknown'}`).digest('hex').slice(0, 32);

  return suggestLandingDraft(
    {
      drafter,
      enabled: async () => {
        const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
        return Boolean(market && (await getFlags(market.id)).ai_drafting);
      },
      categoryKeywords: async (category) => {
        const [row] = await db.select({ keywords: categories.prohibitedKeywords }).from(categories).where(eq(categories.slug, category)).limit(1);
        return row?.keywords ?? [];
      },
      allowVisitor: async () => (await consumeRateLimit(db, `landing-ai:visitor:${visitor}`, LANDING_AI_PER_VISITOR)).ok,
      allowToday: async () => (await consumeRateLimit(db, 'landing-ai:day', LANDING_AI_PER_DAY)).ok,
      // The error's kind only: never the visitor's words.
      onError: (error) => console.error('[landing-ai]', error instanceof Error ? error.name : 'unknown error'),
    },
    input,
  );
}
