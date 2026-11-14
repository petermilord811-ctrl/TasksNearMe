import type { CategorySlug } from '@/contracts/common';

/**
 * Task types under each category (completion plan 7.5), TaskRabbit-style: what people actually ask for, read
 * from the task's own fields (the posting form's details), so every task has exactly one type and nothing new
 * is asked of the poster. Shown on cards, filterable on the boards (`?type=`), and the base for b7's landing
 * pages and cost guides.
 *
 * Each type says which detail field decides it and the values (or, for counts, the range) that belong to it.
 * The order is the order people see.
 */
export interface TaskTypeDef {
  slug: string;
  /** The task detail that decides it (src/contracts/posting.ts, CATEGORY_DETAIL_FIELDS). */
  field: string;
  /** Choice values that belong to this type. */
  values?: readonly string[];
  /** Count range (inclusive) that belongs to this type; `max` absent means "and up". */
  range?: { min: number; max?: number };
}

export const TASK_TYPES: Record<CategorySlug, readonly TaskTypeDef[]> = {
  'furniture-assembly': [
    { slug: 'desk', field: 'itemType', values: ['desk'] },
    { slug: 'bed', field: 'itemType', values: ['bed'] },
    { slug: 'shelving', field: 'itemType', values: ['bookshelf'] },
    { slug: 'wardrobe', field: 'itemType', values: ['wardrobe'] },
    { slug: 'dresser', field: 'itemType', values: ['dresser'] },
    { slug: 'table', field: 'itemType', values: ['table', 'chairs'] },
    { slug: 'other', field: 'itemType', values: ['other'] },
  ],
  'moving-help': [
    { slug: 'load_truck', field: 'moveType', values: ['load_truck'] },
    { slug: 'unload_truck', field: 'moveType', values: ['unload_truck'] },
    { slug: 'load_and_unload', field: 'moveType', values: ['load_and_unload'] },
    { slug: 'within_home', field: 'moveType', values: ['within_home'] },
  ],
  'yard-cleanup': [
    { slug: 'leaves', field: 'work', values: ['leaves'] },
    { slug: 'weeding', field: 'work', values: ['weeding'] },
    { slug: 'pruning', field: 'work', values: ['pruning'] },
    { slug: 'debris', field: 'work', values: ['debris'] },
    { slug: 'mixed', field: 'work', values: ['mixed'] },
  ],
  'light-cleaning': [
    { slug: 'studio_one', field: 'bedrooms', range: { min: 0, max: 1 } },
    { slug: 'two_bedroom', field: 'bedrooms', range: { min: 2, max: 2 } },
    { slug: 'three_plus', field: 'bedrooms', range: { min: 3 } },
  ],
  'computer-help': [
    { slug: 'computer', field: 'device', values: ['laptop', 'desktop'] },
    { slug: 'phone_tablet', field: 'device', values: ['phone', 'tablet'] },
    { slug: 'wifi', field: 'device', values: ['wifi_router'] },
    { slug: 'printer', field: 'device', values: ['printer'] },
    { slug: 'tv', field: 'device', values: ['tv'] },
    { slug: 'other', field: 'device', values: ['other'] },
  ],
};

/** The category's types, in display order. */
export function taskTypesFor(category: CategorySlug): readonly TaskTypeDef[] {
  return TASK_TYPES[category] ?? [];
}

export function isTaskType(category: CategorySlug, slug: string): boolean {
  return taskTypesFor(category).some((type) => type.slug === slug);
}

function matches(type: TaskTypeDef, value: unknown): boolean {
  if (type.values) return typeof value === 'string' && type.values.includes(value);
  if (type.range) {
    const count = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
    return Number.isFinite(count) && count >= type.range.min && (type.range.max === undefined || count <= type.range.max);
  }
  return false;
}

/** The type a task's details put it in (undefined when the deciding field is missing). */
export function taskTypeOf(category: CategorySlug, details: Record<string, unknown> | null | undefined): string | undefined {
  if (!details) return undefined;
  return taskTypesFor(category).find((type) => matches(type, details[type.field]))?.slug;
}
