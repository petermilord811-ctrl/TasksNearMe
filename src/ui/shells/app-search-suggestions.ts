import type { CategorySlug, Mode } from '@/contracts';
import { routes } from '@/contracts/routes';
import { readTaskIntent } from '@/shared/task-intent';
import type { NavId, NavItem } from './nav';

/**
 * What the search bar at the top of the app suggests as someone types (owner, 2026-11-23: "AI search and animated, very
 * helpful features"). Instant and free: the words are read on the device (`readTaskIntent`, the landing assistant's
 * reader), and each suggestion is a place in the app with those words. "Ask AI" (the dashboard's AI search, counted by
 * the plan) runs only when chosen.
 */

export type SearchSuggestion =
  | { id: string; kind: 'ask_ai' }
  | { id: string; kind: 'post_task'; href: string; title: string; category?: CategorySlug }
  | { id: string; kind: 'find_work'; href: string; category?: CategorySlug }
  | { id: string; kind: 'find_helpers'; href: string; category?: CategorySlug }
  | { id: string; kind: 'neighbors'; href: string }
  | { id: string; kind: 'page'; href: string; nav: NavId };

export interface SuggestionInput {
  text: string;
  mode: Mode;
  /** Ask AI is offered (set up here, and the shell has the handler). */
  aiAvailable: boolean;
  /** The page is Neighbors: searching it comes first. */
  onNeighbors: boolean;
  /** The pages to match by name: the mode's navigation, labelled in the page's language. */
  pages: readonly { item: NavItem; label: string }[];
}

/** The longest words carried into a search link (the board's own limit). */
export const SEARCH_WORDS_MAX = 80;

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Pages whose name contains every word typed (at most three), in the navigation's order. */
export function matchingPages(text: string, pages: SuggestionInput['pages']): SuggestionInput['pages'] {
  const words = normalize(text).split(/\s+/).filter((word) => word.length >= 2);
  if (words.length === 0) return [];
  return pages.filter(({ label }) => words.every((word) => normalize(label).includes(word))).slice(0, 3);
}

export function buildSearchSuggestions({ text, mode, aiAvailable, onNeighbors, pages }: SuggestionInput): SearchSuggestion[] {
  const words = text.replace(/\s+/g, ' ').trim().slice(0, SEARCH_WORDS_MAX);
  if (words.length < 2) return [];
  const intent = readTaskIntent(words);
  const category = intent.category ?? undefined;
  const out: SearchSuggestion[] = [];
  if (aiAvailable && words.length >= 3) out.push({ id: 'ask-ai', kind: 'ask_ai' });
  const neighbors: SearchSuggestion = { id: 'neighbors', kind: 'neighbors', href: routes.app.community({ q: words }) };
  if (onNeighbors) out.push(neighbors);
  // Work the platform doesn't offer (TV mounting, licensed trades) is never suggested as a task to post.
  const post: SearchSuggestion | null = intent.notOffered
    ? null
    : { id: 'post', kind: 'post_task', href: routes.app.newTask({ describe: words, ...(intent.title ? { title: intent.title } : {}), ...(category ? { category } : {}) }), title: intent.title || words, ...(category ? { category } : {}) };
  // A category the words point to finds more than the words themselves would.
  const findWork: SearchSuggestion = { id: 'find-work', kind: 'find_work', href: routes.app.findWork(category ? { category } : { q: words }), ...(category ? { category } : {}) };
  const findHelpers: SearchSuggestion = { id: 'find-helpers', kind: 'find_helpers', href: routes.app.helpers(category ? { category } : { q: words }), ...(category ? { category } : {}) };
  const ordered = mode === 'helper' ? [findWork, post] : [post, findHelpers];
  for (const suggestion of ordered) if (suggestion) out.push(suggestion);
  if (!onNeighbors) out.push(neighbors);
  for (const { item } of matchingPages(words, pages)) out.push({ id: `page-${item.id}`, kind: 'page', href: item.href, nav: item.id });
  return out;
}
