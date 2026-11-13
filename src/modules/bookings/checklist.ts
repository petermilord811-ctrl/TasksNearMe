import { EVIDENCE_CHECKLISTS, type CategorySlug, type CompletionChecklistView } from '@/contracts';

/**
 * Structured evidence checklists (blueprint 01, P2): the category's short list the helper may tick when sending the
 * work. Pure rules, shared by the completion form's rules, what's stored, and what both people (and staff) see.
 */

/** The category's checklist keys, in order (none for a category without one). */
export function checklistFor(categorySlug: string): readonly string[] {
  return (EVIDENCE_CHECKLISTS as Record<string, readonly string[]>)[categorySlug] ?? [];
}

/**
 * What's stored with the completion: every key of the category's checklist, ticked or not, so the client sees what
 * the helper confirmed and what they didn't. Keys the category doesn't have are dropped.
 */
export function checklistAnswers(keys: readonly string[], ticks: Record<string, boolean> | undefined): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, ticks?.[key] === true]));
}

/**
 * The stored answers as people see them, in the category's order (stored JSON keeps no order). Nothing for work
 * sent before checklists existed (an empty answer) or for a category without one.
 */
export function checklistView(categorySlug: string, stored: Record<string, boolean> | null | undefined): CompletionChecklistView | undefined {
  const keys = checklistFor(categorySlug);
  if (!stored || keys.length === 0) return undefined;
  const items = keys.filter((key) => Object.hasOwn(stored, key)).map((key) => ({ key, done: stored[key] === true }));
  return items.length > 0 ? { categorySlug: categorySlug as CategorySlug, items } : undefined;
}
