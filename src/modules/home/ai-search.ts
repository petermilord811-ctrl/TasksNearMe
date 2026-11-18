import {
  aiSearchInputSchema,
  type AiSearchAnswer,
  type AiSearchBlock,
  type AiSearchResult,
  type CategorySlug,
  type DashboardItem,
  type DashboardSeeAll,
  type HelperSummary,
  type Mode,
} from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { NeedMatch, NeedMatcher, NeedWhen } from '@/integrations/ai/need-matcher';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { RateLimitRule } from '@/platform/rate-limit';

/**
 * AI search on the dashboard ("describe what you need", completion plan 9.9; docs/ui/dashboard-9.9.md §6). AI only
 * turns the words into filters (`NeedMatcher`); the helpers and tasks are the app's own reads with those filters, so
 * nothing shown is invented. The words go to the matcher and nowhere else: nothing here stores or logs them.
 */

/** A burst guard on top of the plan's monthly count: this many searches a minute per person. */
export const AI_SEARCH_BURST: RateLimitRule = { limit: 6, windowSeconds: 60 };
export const AI_SEARCH_HELPERS = 3;
/** Open tasks in the answer: up to 5 for a helper, 3 similar ones for someone who needs help. */
export const AI_SEARCH_TASKS = { find_work: 5, get_help: 3 } as const;

export interface AiSearchFilters {
  category?: CategorySlug;
  q?: string;
  when?: NeedWhen;
  /** A neighborhood's slug. */
  area?: string;
}

export interface AiSearchDeps {
  /** Null when AI search isn't set up here (production without a key). */
  matcher: NeedMatcher | null;
  /** The plan's check, counting this search (billing's `useAiSearch`). */
  useSearch: () => Promise<{ ok: true; remaining: number | null } | { ok: false; reason: AiSearchBlock }>;
  /** Counts one search toward `AI_SEARCH_BURST`; false once over it. */
  allowBurst: () => Promise<boolean>;
  /** The category's own prohibited words (the global list is added here). */
  categoryKeywords: (category: CategorySlug) => Promise<readonly string[]>;
  /** The person's market's neighborhoods. */
  areas: () => Promise<{ slug: string; name: string }[]>;
  /** Helpers who do the category (and serve the area), most reliable first. */
  findHelpers: (filters: Pick<AiSearchFilters, 'category' | 'area'>, limit: number) => Promise<HelperSummary[]>;
  /** Open tasks nearby with these filters, soonest first: a helper's find-work view, a client's public page. */
  findTasks: (filters: AiSearchFilters, limit: number) => Promise<DashboardItem[]>;
  /** Where "See all" for the tasks goes: Find work for helpers, the market's board for clients. */
  tasksLink: (filters: Omit<AiSearchFilters, 'area'>) => Extract<DashboardSeeAll, { kind: 'find_work' | 'board' }>;
  /** An unexpected failure (never given the words). */
  onError?: (error: unknown) => void;
}

/**
 * The checks, in order: 3–300 characters, AI set up here, the burst guard, nothing prohibited in the words, then the
 * plan (which counts the search, so it comes last before AI runs). Then AI reads the words; a refusal or a request
 * for something that can't be booked is `prohibited`. Then the searches: with the words first, and the category
 * alone when the words find nothing.
 */
export async function runAiSearch(deps: AiSearchDeps, input: { text: unknown; mode: Mode }): Promise<AiSearchResult> {
  const parsed = aiSearchInputSchema.safeParse({ text: typeof input?.text === 'string' ? input.text : '' });
  if (!parsed.success) return { ok: false, code: 'too_short' };
  const { text } = parsed.data;
  if (!deps.matcher) return { ok: false, code: 'ai_off' };
  if (!(await deps.allowBurst())) return { ok: false, code: 'rate_limited' };
  if (findProhibitedPhrase(text, GLOBAL_PROHIBITED_PHRASES)) return { ok: false, code: 'prohibited' };
  const allowed = await deps.useSearch();
  if (!allowed.ok) return { ok: false, code: allowed.reason };

  const areas = await deps.areas();
  let match: NeedMatch;
  try {
    match = await deps.matcher.match({ text, mode: input.mode, areas: areas.map((area) => area.name) });
  } catch (error) {
    if (error instanceof AiRefusedError) return { ok: false, code: 'prohibited' };
    if (!(error instanceof AiUnavailableError)) deps.onError?.(error);
    return { ok: false, code: 'unavailable' };
  }
  if (match.prohibited || (match.category && findProhibitedPhrase(text, await deps.categoryKeywords(match.category)))) return { ok: false, code: 'prohibited' };

  const area = match.area ? areas.find((candidate) => candidate.name === match.area) : undefined;
  const base: AiSearchFilters = { ...(match.category ? { category: match.category } : {}), ...(match.when ? { when: match.when } : {}) };
  const words = match.keywords.join(' ');
  const taskLimit = AI_SEARCH_TASKS[match.intent];
  // The words narrow the search; when they find nothing, the category alone does (AI's words can be too specific).
  let tasks = await deps.findTasks({ ...base, ...(words ? { q: words } : {}), ...(area ? { area: area.slug } : {}) }, taskLimit);
  let searched: AiSearchFilters = { ...base, ...(words ? { q: words } : {}) };
  if (tasks.length === 0 && words && match.category) {
    tasks = await deps.findTasks({ ...base, ...(area ? { area: area.slug } : {}) }, taskLimit);
    searched = base;
  }
  const getHelp = match.intent === 'get_help';
  const helpers = getHelp && match.category ? await deps.findHelpers({ category: match.category, ...(area ? { area: area.slug } : {}) }, AI_SEARCH_HELPERS) : [];
  const answer: AiSearchAnswer = {
    understood: {
      intent: match.intent,
      ...(match.category ? { category: match.category } : {}),
      ...(match.when ? { when: match.when } : {}),
      ...(area ? { area: { slug: area.slug, name: area.name } } : {}),
      keywords: match.keywords,
    },
    // The posting wizard opens with the words and AI's title: no contact details in either, whatever was typed.
    ...(getHelp && match.category && match.title ? { draft: { title: maskContactDetails(match.title).text, category: match.category, describe: maskContactDetails(text).text } } : {}),
    helpers,
    tasks,
    ...(getHelp && match.category ? { helpersQuery: { category: match.category, ...(area ? { area: area.slug } : {}) } } : {}),
    ...(tasks.length > 0 || !getHelp ? { tasksLink: deps.tasksLink({ ...(searched.category ? { category: searched.category } : {}), ...(searched.q ? { q: searched.q } : {}), ...(searched.when ? { when: searched.when } : {}) }) } : {}),
  };
  return { ok: true, answer, remaining: allowed.remaining };
}
