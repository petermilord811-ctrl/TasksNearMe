import { z } from 'zod';
import { marketLocalToUtc } from '@/shared/format';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import { CATEGORY_SLUGS } from './common';
import type { CategoryView, MarketView } from './marketing';
import type { PriceBreakdown, PricingInput } from './money';

/**
 * The posting wizard (`/app/tasks/new`, blueprint 02 J1). The UI holds the draft while the
 * person moves through the steps; the app validates it again and creates the task on "Post".
 */

export const POST_TASK_STEPS = ['category', 'describe', 'details', 'photos', 'where', 'when', 'budget', 'review'] as const;
export type PostTaskStep = (typeof POST_TASK_STEPS)[number];

// ---- Category details --------------------------------------------------------------------------

/**
 * Category-specific questions. The UI renders them generically: labels, hints, and option labels
 * come from copy (`postTask.details.<category>.<key>`), keyed by these codes.
 */
export type DetailFieldDef =
  | { key: string; kind: 'choice'; options: readonly string[]; required: boolean }
  | { key: string; kind: 'count'; min: number; max: number; required: boolean }
  | { key: string; kind: 'yes_no'; required: boolean }
  | { key: string; kind: 'text'; maxLength: number; required: boolean };

export const CATEGORY_DETAIL_FIELDS: Record<CategorySlug, readonly DetailFieldDef[]> = {
  'furniture-assembly': [
    { key: 'itemType', kind: 'choice', options: ['desk', 'bed', 'bookshelf', 'wardrobe', 'dresser', 'table', 'chairs', 'other'], required: true },
    { key: 'itemCount', kind: 'count', min: 1, max: 10, required: true },
    { key: 'brand', kind: 'text', maxLength: 60, required: false },
    { key: 'floor', kind: 'count', min: 0, max: 40, required: false },
    { key: 'elevator', kind: 'yes_no', required: false },
    { key: 'wallAnchoring', kind: 'yes_no', required: false },
    { key: 'toolsOnSite', kind: 'yes_no', required: false },
  ],
  'moving-help': [
    { key: 'moveType', kind: 'choice', options: ['within_home', 'load_truck', 'unload_truck', 'load_and_unload'], required: true },
    { key: 'rooms', kind: 'count', min: 1, max: 10, required: false },
    { key: 'heavyItems', kind: 'text', maxLength: 200, required: false },
    { key: 'stairFlights', kind: 'count', min: 0, max: 10, required: false },
    { key: 'elevator', kind: 'yes_no', required: false },
  ],
  'yard-cleanup': [
    { key: 'yardSize', kind: 'choice', options: ['small', 'medium', 'large'], required: true },
    { key: 'work', kind: 'choice', options: ['leaves', 'weeding', 'pruning', 'debris', 'mixed'], required: true },
    // Helpers don't haul anything away (blueprint 01 §6.1): green waste goes to the curb or stays with the poster.
    { key: 'greenWastePlan', kind: 'choice', options: ['curbside', 'poster_handles'], required: true },
    { key: 'toolsOnSite', kind: 'yes_no', required: false },
  ],
  'light-cleaning': [
    { key: 'bedrooms', kind: 'count', min: 0, max: 8, required: true },
    { key: 'bathrooms', kind: 'count', min: 1, max: 6, required: true },
    { key: 'suppliesOnSite', kind: 'yes_no', required: false },
    { key: 'pets', kind: 'yes_no', required: false },
  ],
  'computer-help': [
    { key: 'device', kind: 'choice', options: ['phone', 'tablet', 'laptop', 'desktop', 'printer', 'wifi_router', 'tv', 'other'], required: true },
    { key: 'need', kind: 'choice', options: ['setup', 'fix', 'how_to', 'backup', 'other'], required: true },
    { key: 'deviceBrand', kind: 'text', maxLength: 60, required: false },
  ],
};

export type TaskDetailsValue = Record<string, string | number | boolean>;

/** Field key → error code for one category's details. Empty when valid. */
export function validateTaskDetails(category: CategorySlug, details: TaskDetailsValue): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {};
  for (const field of CATEGORY_DETAIL_FIELDS[category]) {
    const value = details[field.key];
    if (value === undefined || value === '') {
      if (field.required) errors[field.key] = 'required';
      continue;
    }
    if (field.kind === 'choice' && (typeof value !== 'string' || !field.options.includes(value))) errors[field.key] = 'invalid';
    if (field.kind === 'count' && (typeof value !== 'number' || !Number.isInteger(value) || value < field.min || value > field.max)) {
      errors[field.key] = 'out_of_range';
    }
    if (field.kind === 'yes_no' && typeof value !== 'boolean') errors[field.key] = 'invalid';
    if (field.kind === 'text' && (typeof value !== 'string' || value.trim().length > field.maxLength)) errors[field.key] = 'too_long';
  }
  return errors;
}

// ---- Location, photos, AI ----------------------------------------------------------------------

export interface AddressSuggestion {
  /** Opaque id; the app resolves it to the exact address on "Post". */
  placeId: string;
  /** "1234 Example Lane" */
  line1: string;
  /** "Austin, TX 78723" */
  line2: string;
  /** The neighborhood helpers will see ("Mueller"). Absent outside the market. */
  areaName?: string;
  /** False: outside the service area. Posting isn't possible there; offer `routes.waitlist()`. */
  inServiceArea: boolean;
}

export type PhotoUploadResult =
  | { ok: true; photo: Photo }
  | { ok: false; code: 'too_large' | 'unsupported_type' | 'too_many' | 'rate_limited' | 'unknown' };

/** "Help me describe this" (blueprint 02 J1 step 2). Nothing is posted automatically. */
export interface AiTaskDraft {
  title: string;
  description: string;
  details: TaskDetailsValue;
  /** Things the poster may want to add, shown as a checklist. */
  openQuestions: string[];
}

export type AiDraftResult =
  | { ok: true; draft: AiTaskDraft }
  | { ok: false; code: 'unavailable' | 'rate_limited' | 'prohibited' };

// ---- Page data and the draft schema ------------------------------------------------------------

export interface TaskPostingRules {
  /** The start must be at least this many hours away… */
  minLeadHours: number;
  /** …and at most this many days out. */
  maxLeadDays: number;
  maxPhotos: number;
  maxPhotoMegabytes: number;
  /** Expense allowance cap. */
  maxExpenseAllowanceCents: Cents;
}

export interface PostTaskPageData {
  market: MarketView;
  categories: CategoryView[];
  /** From `?category=`; start on the describe step when set. */
  initialCategory?: CategorySlug;
  rules: TaskPostingRules;
  /** The `ai_drafting` flag: show "Help me describe this". */
  aiDraftingEnabled: boolean;
  /** For validating the schedule on the client. The app checks again on "Post". */
  now: ISODateTime;
  /**
   * The sessionStorage key for the in-progress draft, scoped to the signed-in person, so a draft
   * never shows up for someone else on a shared device. Use it instead of a fixed key.
   */
  draftStorageKey?: string;
}

export const TASK_TITLE_MAX = 80;
export const TASK_DESCRIPTION_MAX = 2000;

const timeField = z.string(FIELD('required')).regex(/^([01]\d|2[0-3]):[0-5]\d$/, FIELD('invalid'));
function FIELD(code: FieldErrorCode) {
  return code;
}

/**
 * The draft schema, built from the page's rules and categories so the client and the server apply
 * the same checks. Issue paths are dotted field names (`schedule.startTime`, `details.itemType`).
 */
export function createTaskDraftSchema(context: Pick<PostTaskPageData, 'rules' | 'categories' | 'now'>) {
  const { rules, categories } = context;
  const now = new Date(context.now).getTime();

  return z
    .object({
      categorySlug: z.enum(CATEGORY_SLUGS, FIELD('required')),
      title: z.string(FIELD('required')).trim().min(8, FIELD('too_short')).max(TASK_TITLE_MAX, FIELD('too_long')),
      description: z
        .string(FIELD('required'))
        .trim()
        .min(20, FIELD('too_short'))
        .max(TASK_DESCRIPTION_MAX, FIELD('too_long')),
      details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      photoIds: z.array(z.string()).max(rules.maxPhotos, FIELD('too_long')),
      location: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('remote') }),
        z.object({
          mode: z.literal('local'),
          placeId: z.string(FIELD('required')).min(1, FIELD('required')),
          unit: z.string().trim().max(20, FIELD('too_long')).optional(),
          accessNotes: z.string().trim().max(300, FIELD('too_long')).optional(),
        }),
      ]),
      schedule: z.object({
        /** Market-local date, "2026-11-21". */
        date: z.string(FIELD('required')).regex(/^\d{4}-\d{2}-\d{2}$/, FIELD('required')),
        /** Any time that day (no window). */
        flexible: z.boolean(),
        /** Market-local "HH:MM", 30-minute steps. Required unless flexible. */
        startTime: timeField.optional(),
        endTime: timeField.optional(),
      }),
      budget: z.discriminatedUnion('type', [
        z.object({ type: z.literal('fixed'), priceCents: z.number(FIELD('required')).int().positive(FIELD('required')) }),
        z.object({
          type: z.literal('hourly'),
          rateCents: z.number(FIELD('required')).int().positive(FIELD('required')),
          estimatedHours: z.number(FIELD('required')).positive(FIELD('required')).multipleOf(0.5, FIELD('invalid')),
          hoursCap: z.number(FIELD('required')).positive(FIELD('required')).multipleOf(0.5, FIELD('invalid')),
        }),
      ]),
      expenseAllowance: z
        .object({
          amountCents: z.number(FIELD('required')).int().min(0).max(rules.maxExpenseAllowanceCents, FIELD('out_of_range')),
          description: z.string(FIELD('required')).trim().min(3, FIELD('too_short')).max(120, FIELD('too_long')),
        })
        .optional(),
    })
    .superRefine((draft, ctx) => {
      const issue = (path: (string | number)[], message: FieldErrorCode) => ctx.addIssue({ code: 'custom', path, message });
      const category = categories.find((candidate) => candidate.slug === draft.categorySlug);
      if (!category) return issue(['categorySlug'], 'not_supported');

      for (const [key, code] of Object.entries(validateTaskDetails(category.slug, draft.details))) issue(['details', key], code);

      if (draft.location.mode === 'remote' && !category.remoteAllowed) issue(['location', 'mode'], 'not_supported');

      // Schedule: market-local window → UTC, within the lead-time policy.
      const { date, flexible, startTime, endTime } = draft.schedule;
      if (!flexible && !startTime) issue(['schedule', 'startTime'], 'required');
      if (!flexible && !endTime) issue(['schedule', 'endTime'], 'required');
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const start = new Date(marketLocalToUtc(date, flexible || !startTime ? '00:00' : startTime)).getTime();
        const dayEnd = new Date(marketLocalToUtc(date, '23:30')).getTime();
        const earliest = now + rules.minLeadHours * 3_600_000;
        const latest = now + rules.maxLeadDays * 86_400_000;
        // Flexible days only need some of the day left after the lead time.
        if ((flexible ? dayEnd : start) < earliest) issue(['schedule', flexible ? 'date' : 'startTime'], 'out_of_range');
        if (start > latest) issue(['schedule', 'date'], 'out_of_range');
        if (!flexible && startTime && endTime && endTime <= startTime) issue(['schedule', 'endTime'], 'out_of_range');
      }

      // Budget: at least the category minimum; hourly caps cover the estimate and the minimum hours.
      if (draft.budget.type === 'fixed') {
        if (draft.budget.priceCents < category.minPriceCents) issue(['budget', 'priceCents'], 'out_of_range');
      } else {
        const { rateCents, estimatedHours, hoursCap } = draft.budget;
        if (category.minHours && estimatedHours < category.minHours) issue(['budget', 'estimatedHours'], 'out_of_range');
        if (hoursCap < estimatedHours) issue(['budget', 'hoursCap'], 'out_of_range');
        if (rateCents * estimatedHours < category.minPriceCents) issue(['budget', 'rateCents'], 'out_of_range');
      }
    });
}

export type TaskDraftSchema = ReturnType<typeof createTaskDraftSchema>;
export type TaskDraftInput = z.input<TaskDraftSchema>;

/**
 * Handlers for PostTaskScreen.
 * - `onPost`: ok `submitted` + `redirectTo` (the new task's page). Errors: `validation_failed` with
 *   dotted `fieldErrors` (`description: ['prohibited']`, `schedule.startTime: ['out_of_range']`);
 *   `limit_reached` (3 open tasks in the first week); `rate_limited` + `retryAt`.
 * - `onQuote`: the full price breakdown for the review step (the UI never computes fees).
 */
export interface PostTaskHandlers {
  onDraftWithAi: QueryHandler<{ categorySlug: CategorySlug; text: string }, AiDraftResult>;
  onSearchAddresses: QueryHandler<{ query: string }, AddressSuggestion[]>;
  /** FormData with one `file` (JPEG, PNG, WebP, or HEIC). */
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  onQuote: QueryHandler<{ budget: PricingInput; expenseAllowanceCents: Cents }, PriceBreakdown>;
  onPost: ActionHandler<TaskDraftInput>;
  /** Thumbnails for photo ids restored from a saved draft (only the person's own uploads). */
  onResolvePhotos?: QueryHandler<{ photoIds: string[] }, Photo[]>;
}
