import { CATEGORY_SLUGS, type CategorySlug, type LandingAiSuggestResult } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { TaskDrafter } from '@/integrations/ai/task-drafter';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { RateLimitRule } from '@/platform/rate-limit';

/**
 * "Write it with AI" on the public landing page, for visitors who haven't signed in. Every call is a paid Claude
 * request: one draft costs about $0.012 on the default model (Claude Opus 5.5), so these two limits are the cost
 * guard. At the daily cap that's about $1.20 a day; per visitor, about $0.07 an hour. Change them here.
 */
/** One visitor (by IP): this many drafts an hour. */
export const LANDING_AI_PER_VISITOR: RateLimitRule = { limit: 6, windowSeconds: 60 * 60 };
/** Everyone together: this many AI drafts a day (about $1.20 at $0.012 each). */
export const LANDING_AI_PER_DAY: RateLimitRule = { limit: 100, windowSeconds: 24 * 60 * 60 };

const TEXT_MIN = 3;
const TEXT_MAX = 1000;

export interface LandingAiDeps {
  /** The app's drafter (null when AI writing isn't set up, as in production without a key). */
  drafter: TaskDrafter | null;
  /** The market's `ai_drafting` flag. */
  enabled: () => Promise<boolean>;
  /** The category's own prohibited keywords (the global list is added here). */
  categoryKeywords: (category: CategorySlug) => Promise<readonly string[]>;
  /** Counts one try for this visitor; false once they're over `LANDING_AI_PER_VISITOR`. */
  allowVisitor: () => Promise<boolean>;
  /** Counts one AI call for everyone today; false once over `LANDING_AI_PER_DAY`. */
  allowToday: () => Promise<boolean>;
  /** An unexpected failure (never given the visitor's words). */
  onError?: (error: unknown) => void;
}

/**
 * The checks, in order: a known category (an unknown one would break the prompt), 3–1000 characters, AI on and
 * set up, this visitor's hourly limit, nothing prohibited (the global list and the category's own words), the
 * daily cap (counted last, so only real AI calls use it), then the draft with any contact details masked. The
 * words are only passed to the drafter: nothing here stores or logs them.
 */
export async function suggestLandingDraft(deps: LandingAiDeps, input: { text: unknown; category: unknown }): Promise<LandingAiSuggestResult> {
  const category = input?.category;
  if (typeof category !== 'string' || !(CATEGORY_SLUGS as readonly string[]).includes(category)) return { ok: false, code: 'unavailable' };
  const slug = category as CategorySlug;
  const text = String(input?.text ?? '').trim().slice(0, TEXT_MAX);
  if (text.length < TEXT_MIN) return { ok: false, code: 'too_short' };
  if (!deps.drafter || !(await deps.enabled())) return { ok: false, code: 'unavailable' };
  if (!(await deps.allowVisitor())) return { ok: false, code: 'rate_limited' };
  if (findProhibitedPhrase(text, [...GLOBAL_PROHIBITED_PHRASES, ...(await deps.categoryKeywords(slug))])) return { ok: false, code: 'prohibited' };
  if (!(await deps.allowToday())) return { ok: false, code: 'rate_limited' };
  try {
    const draft = await deps.drafter.draft({ categorySlug: slug, text });
    // The task board is public: no phone numbers, emails or links, whatever was typed or written.
    return { ok: true, draft: { title: maskContactDetails(draft.title).text, description: maskContactDetails(draft.description).text } };
  } catch (error) {
    if (error instanceof AiRefusedError) return { ok: false, code: 'prohibited' };
    if (!(error instanceof AiUnavailableError)) deps.onError?.(error);
    return { ok: false, code: 'unavailable' };
  }
}
