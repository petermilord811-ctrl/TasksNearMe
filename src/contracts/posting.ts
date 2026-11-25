import { z } from 'zod';
import { marketLocalToUtc } from '@/shared/format';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { BotCheckConfig, BotCheckInput } from './bot-check';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import { CATEGORY_SLUGS } from './common';
import type { CategoryView, MarketView } from './marketing';
import type { PriceBreakdown, PricingInput } from './money';
import type { AiAssistResult, PriceCheck, PriceCheckInput } from './ai-assist';

/**
 * The posting wizard (`/app/tasks/new`, blueprint 02 J1). The UI holds the draft while the
 * person moves through the steps; the app validates it again and creates the task on "Post".
 */

/** Photos are part of the words step (visitor-to-first-post walk, J-V5): seven steps, where there were eight. */
export const POST_TASK_STEPS = ['category', 'describe', 'details', 'where', 'when', 'budget', 'review'] as const;
export type PostTaskStep = (typeof POST_TASK_STEPS)[number];

/**
 * A step a saved draft or a link may still name, from before photos joined the words step (J-V5), and where it opens
 * now. Anything else that isn't a step is ignored.
 */
export function currentPostTaskStep(value: unknown): PostTaskStep | undefined {
  if (value === 'photos') return 'describe';
  return (POST_TASK_STEPS as readonly unknown[]).includes(value) ? (value as PostTaskStep) : undefined;
}

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

/** Unanswered optional fields: forms may hold them as undefined, '', null, or NaN (an empty number input). */
export function isEmptyDetail(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value));
}

/** The details without unanswered fields, as stored. */
export function compactTaskDetails(details: Record<string, unknown>): TaskDetailsValue {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => !isEmptyDetail(value))) as TaskDetailsValue;
}

/** Field key → error code for one category's details. Empty when valid. */
export function validateTaskDetails(category: CategorySlug, details: Record<string, unknown>): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {};
  for (const field of CATEGORY_DETAIL_FIELDS[category]) {
    const value = details[field.key];
    if (isEmptyDetail(value)) {
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

// ---- Templates ----------------------------------------------------------------------------------

/**
 * Starting points for common tasks (blueprint 01, P2 "draft templates per category"), within each category's
 * allowed scope (no TV mounting, no licensed trades, no pianos or safes, no ladders or tree work, helpers never
 * handle passwords). Picking one fills the title, a description (a short summary and the questions worth
 * answering) and details that fit; the poster changes anything. Never a price. The words live in copy
 * (`postTask.templates.<id>.label` / `.title` / `.description`), so they can be translated.
 */
export const TASK_TEMPLATE_IDS = [
  'furniture-desk',
  'furniture-bed',
  'furniture-wardrobe',
  'furniture-anchor',
  'moving-load-truck',
  'moving-within-home',
  'moving-carry-in',
  'yard-leaves',
  'yard-weeding',
  'yard-hedges',
  'cleaning-apartment',
  'cleaning-kitchen',
  'cleaning-move-out',
  'computer-new-laptop',
  'computer-wifi',
  'computer-printer',
] as const;
export type TaskTemplateId = (typeof TASK_TEMPLATE_IDS)[number];

export interface TaskTemplate {
  id: TaskTemplateId;
  categorySlug: CategorySlug;
  /** Details that fit the example (valid for the category's questions); the poster adjusts them. */
  details: TaskDetailsValue;
}

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { id: 'furniture-desk', categorySlug: 'furniture-assembly', details: { itemType: 'desk', itemCount: 1 } },
  { id: 'furniture-bed', categorySlug: 'furniture-assembly', details: { itemType: 'bed', itemCount: 1 } },
  { id: 'furniture-wardrobe', categorySlug: 'furniture-assembly', details: { itemType: 'wardrobe', itemCount: 1, wallAnchoring: true } },
  { id: 'furniture-anchor', categorySlug: 'furniture-assembly', details: { itemType: 'bookshelf', itemCount: 1, wallAnchoring: true } },
  { id: 'moving-load-truck', categorySlug: 'moving-help', details: { moveType: 'load_truck' } },
  { id: 'moving-within-home', categorySlug: 'moving-help', details: { moveType: 'within_home' } },
  { id: 'moving-carry-in', categorySlug: 'moving-help', details: { moveType: 'unload_truck' } },
  { id: 'yard-leaves', categorySlug: 'yard-cleanup', details: { yardSize: 'medium', work: 'leaves', greenWastePlan: 'curbside' } },
  { id: 'yard-weeding', categorySlug: 'yard-cleanup', details: { yardSize: 'small', work: 'weeding', greenWastePlan: 'curbside' } },
  { id: 'yard-hedges', categorySlug: 'yard-cleanup', details: { yardSize: 'small', work: 'pruning', greenWastePlan: 'curbside' } },
  { id: 'cleaning-apartment', categorySlug: 'light-cleaning', details: { bedrooms: 1, bathrooms: 1 } },
  { id: 'cleaning-kitchen', categorySlug: 'light-cleaning', details: { bedrooms: 1, bathrooms: 1 } },
  { id: 'cleaning-move-out', categorySlug: 'light-cleaning', details: { bedrooms: 2, bathrooms: 1 } },
  { id: 'computer-new-laptop', categorySlug: 'computer-help', details: { device: 'laptop', need: 'setup' } },
  { id: 'computer-wifi', categorySlug: 'computer-help', details: { device: 'wifi_router', need: 'fix' } },
  { id: 'computer-printer', categorySlug: 'computer-help', details: { device: 'printer', need: 'setup' } },
];

export function isTaskTemplateId(value: unknown): value is TaskTemplateId {
  return typeof value === 'string' && (TASK_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function findTaskTemplate(id: string | undefined): TaskTemplate | undefined {
  return id ? TASK_TEMPLATES.find((template) => template.id === id) : undefined;
}

// ---- Location, photos, AI ----------------------------------------------------------------------

export interface AddressSuggestion {
  /** Opaque id; the app resolves it to the exact address on "Post". */
  placeId: string;
  /** "1234 Example Lane" */
  line1: string;
  /** "Austin, TX 78723" */
  line2: string;
  /** The area helpers will see: the neighborhood in the market ("Mueller"), or the city outside it ("Waco, TX"). */
  areaName?: string;
  /**
   * That area's public point for the preview map, never the address's own: the neighborhood's center, or outside the
   * market the ZIP code's center (US Census, public data).
   */
  areaPoint?: { lat: number; lng: number };
  /**
   * False: outside the market's service area. It can still be posted (owner, 2026-11-21: "remove the limit of area
   * totally"); the screen says helpers there may be few for now. Helpers see the city, not a neighborhood.
   */
  inServiceArea: boolean;
  /** Outside the service area: where the address is, so the screen can name its city. */
  outside?: { city: string; state: string; zip: string };
}

export type PhotoUploadResult =
  | { ok: true; photo: Photo }
  | { ok: false; code: 'too_large' | 'unsupported_type' | 'too_many' | 'rate_limited' | 'unknown' };

/**
 * "Rewrite with AI" in the description field (blueprint 02 J1 step 2): the description is a formatted post
 * (src/shared/rich-text.ts). The screen applies it in place, with Undo. Nothing is posted automatically.
 */
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
  /**
   * From `?title=`: a title from the landing page's assistant ("Write it with AI", then "Use this draft"), at most
   * `TASK_TITLE_MAX` characters. Prefills the title; the person checks it like anything else.
   */
  initialTitle?: string;
  /**
   * From `?describe=`: the person's own words from the landing page's assistant, or the AI draft's description
   * they chose to use (spaces tidied, line breaks kept, at most `TASK_DESCRIPTION_MAX` characters). Prefills the
   * description field; nothing more is assumed.
   */
  initialDescription?: string;
  /**
   * From `?ai=1` (the landing page's "Draft it with AI"): once the describe step shows, run "Rewrite with AI" on
   * `initialDescription` by itself, once. Only set when `aiDraftingEnabled` and there are words.
   */
  autoDraft?: boolean;
  /** Examples to start from ("Start from an example"), for the market's categories; none when absent. */
  templates?: readonly TaskTemplate[];
  /**
   * From `?template=<id>` (a page's "Post a task like this"): start from that example, on the describe step with
   * its category, title, description and details filled in. Ignored when `repeat` or the landing page's words
   * (`initialDescription`, `initialTitle`) are given.
   */
  initialTemplate?: TaskTemplateId;
  /**
   * "Post again" (plan 4.2), from `?again=<taskId>`: one of the poster's own finished tasks (completed, canceled
   * or expired), repeated. The wizard starts from `draft` and opens on the review step; with `addressDeleted`
   * it opens on the Where step instead.
   */
  repeat?: PostTaskRepeat;
  /**
   * "Ask for help" (plan 9.10), from `?from=<post>`: the person's own community post (a recommendation request or a
   * question) the wizard starts from. Its title, words and service come in as `initialTitle`, `initialDescription`
   * and `initialCategory`; posting sends its id as `fromPostId` so the post and the task link to each other.
   */
  fromPost?: { id: string; title: string };
  rules: TaskPostingRules;
  /** The `ai_drafting` flag: show "Rewrite with AI" in the description field. */
  aiDraftingEnabled: boolean;
  /** The bot check before "Post" (contracts/bot-check.ts; action `post_task`). Absent: none is set up. */
  botCheck?: BotCheckConfig;
  /** For validating the schedule on the client. The app checks again on "Post". */
  now: ISODateTime;
  /**
   * The sessionStorage key for the in-progress draft, scoped to the signed-in person, so a draft
   * never shows up for someone else on a shared device. Use it instead of a fixed key.
   */
  draftStorageKey?: string;
  /**
   * Signed out, at `routes.postTask()` (visitor-to-first-post walk, J-V5): the same steps without the account's
   * tools (no photos, no AI). "Post task" keeps the draft on this device under a one-time code and opens sign-up,
   * whose destination (`routes.app.newTask({ handoff })`) takes the draft over.
   */
  guest?: true;
  /** Signed in, from `?handoff=`: the code of a draft made signed out on this device. The form takes it over and opens on review. */
  handoff?: string;
}

/**
 * A finished task as a new draft: everything but photos, with the same time window on the next date that fits
 * the posting rules (the same weekday when it can be). `address` is the saved address, shown as already chosen:
 * the draft's place id is `REPEAT_PLACE_PREFIX` + the task's id, and the app reads the stored address again on
 * "Post". When the retention timer deleted it (180 days after the last booking there), `addressDeleted` is set,
 * the draft has no place, and the poster searches for the address again.
 */
export interface PostTaskRepeat {
  fromTitle: string;
  draft: TaskDraftInput;
  address?: AddressSuggestion;
  addressDeleted?: boolean;
}

/** The place id of a saved address being reused by "Post again" (`again:<taskId>`). */
export const REPEAT_PLACE_PREFIX = 'again:';

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
/** `context.market.timeZone`: the poster's market, whose wall-clock dates and times the form takes (plan 8.1). */
export function createTaskDraftSchema(context: Pick<PostTaskPageData, 'rules' | 'categories' | 'now'> & { market: Pick<MarketView, 'timeZone'> }) {
  const { rules, categories } = context;
  const timeZone = context.market.timeZone;
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
      // Unanswered optional fields may arrive as undefined, null, or NaN; they're dropped when stored.
      details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.nan(), z.undefined()])),
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
        // At most what an offer can carry ($100,000; $1,000 an hour): a bigger number overflowed the column (sweep).
        z.object({ type: z.literal('fixed'), priceCents: z.number(FIELD('required')).int().positive(FIELD('required')).max(10_000_000, FIELD('out_of_range')) }),
        z.object({
          type: z.literal('hourly'),
          rateCents: z.number(FIELD('required')).int().positive(FIELD('required')).max(100_000, FIELD('out_of_range')),
          // At most a day's work, as offers, invites and changes take (sweep 2026-11-20: a longer estimate got no offer).
          estimatedHours: z.number(FIELD('required')).positive(FIELD('required')).multipleOf(0.5, FIELD('invalid')).max(24, FIELD('out_of_range')),
          hoursCap: z.number(FIELD('required')).positive(FIELD('required')).multipleOf(0.5, FIELD('invalid')).max(24, FIELD('out_of_range')),
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

      // Schedule: the market's local window → UTC, within the lead-time policy.
      const { date, flexible, startTime, endTime } = draft.schedule;
      if (!flexible && !startTime) issue(['schedule', 'startTime'], 'required');
      if (!flexible && !endTime) issue(['schedule', 'endTime'], 'required');
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const start = new Date(marketLocalToUtc(date, flexible || !startTime ? '00:00' : startTime, timeZone)).getTime();
        const dayEnd = new Date(marketLocalToUtc(date, '23:30', timeZone)).getTime();
        const earliest = now + rules.minLeadHours * 3_600_000;
        const latest = now + rules.maxLeadDays * 86_400_000;
        // Flexible days only need some of the day left after the lead time.
        if ((flexible ? dayEnd : start) < earliest) issue(['schedule', flexible ? 'date' : 'startTime'], 'out_of_range');
        if (start > latest) issue(['schedule', 'date'], 'out_of_range');
        if (!flexible && startTime && endTime && endTime <= startTime) issue(['schedule', 'endTime'], 'out_of_range');
      }

      // Budget: hourly caps cover the estimate and the minimum hours. A price under the category's usual minimum is
      // allowed and only noted on the screen (`belowCategoryMinimum`; owner, 2026-11-21).
      if (draft.budget.type === 'hourly') {
        const { estimatedHours, hoursCap } = draft.budget;
        if (category.minHours && estimatedHours < category.minHours) issue(['budget', 'estimatedHours'], 'out_of_range');
        if (hoursCap < estimatedHours) issue(['budget', 'hoursCap'], 'out_of_range');
      }
    });
}

export type TaskDraftSchema = ReturnType<typeof createTaskDraftSchema>;

/**
 * A price under the category's usual minimum (`minPriceCents`): a fixed price, or an hourly rate times the estimated
 * hours. The owner (2026-11-21): "remove minimum budget price: just notify it to user", so posting, offers and
 * requests take such a price and the screens say it's low. False while the amount isn't a usable number yet.
 */
export function belowCategoryMinimum(
  category: Pick<CategoryView, 'minPriceCents'>,
  pricing: { type: 'fixed'; priceCents?: number } | { type: 'hourly'; rateCents?: number; estimatedHours?: number },
): boolean {
  const usable = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (pricing.type === 'fixed') return usable(pricing.priceCents) && pricing.priceCents < category.minPriceCents;
  return usable(pricing.rateCents) && usable(pricing.estimatedHours) && pricing.rateCents * pricing.estimatedHours < category.minPriceCents;
}
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
  /**
   * Sends the bot check's answer as `botCheck` (`fieldErrors.botCheck` when it's turned down), and with `fromPost`
   * the post's id as `fromPostId`, which links the new task to it. `requestKey` is the draft's key for this post
   * (bad connections pass, J-N1): the same key again returns the task the first post made.
   */
  onPost: ActionHandler<TaskDraftInput & BotCheckInput & { fromPostId?: string; requestKey?: string }>;
  /** Thumbnails for photo ids restored from a saved draft (only the person's own uploads). */
  onResolvePhotos?: QueryHandler<{ photoIds: string[] }, Photo[]>;
  /**
   * "Check my price with AI" on the budget step (2026-11-24; only with `aiDraftingEnabled`): a fair range for this task
   * from the market's own prices, sized from the words and details. Changes nothing in the form.
   */
  onCheckPrice?: QueryHandler<PriceCheckInput, AiAssistResult<PriceCheck>>;
}
