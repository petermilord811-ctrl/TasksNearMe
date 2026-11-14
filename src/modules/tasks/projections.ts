import type {
  CategorySlug,
  PricingInput,
  TaskBoardPageData,
  TaskBoardWhen,
  TaskPublicView,
  TaskStatus,
} from '@/contracts';
import { CATEGORY_SLUGS, TASK_BOARD_GROUPS, TASK_BOARD_POSTED, TASK_BOARD_Q_MAX, TASK_BOARD_SORTS, TASK_BOARD_TIMES, TASK_BOARD_VIEWS, TASK_BOARD_WHEN } from '@/contracts';
import { isTaskType, taskTypeOf } from '@/shared/task-types';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { publicExcerpt } from '@/modules/trust/contact-masking';

/** Pure projections from task rows to public contract types, and board query parsing. */

export interface PublicTaskRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  mode: string;
  status: string;
  pricingType: string;
  budgetCents: number | null;
  hourlyRateCents: number | null;
  estimatedHours: number | null;
  hoursCap: number | null;
  windowStart: Date;
  windowEnd: Date;
  flexible: boolean;
  publicLat: number | null;
  publicLng: number | null;
  offerCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  areaName: string | null;
  marketSlug: string;
  marketName: string;
  poster: { name: string; firstName: string; lastName: string; createdAt: Date; phoneVerifiedAt: Date | null };
  /** The posting form's details; only the field that decides the task type (7.5) is read here. */
  details?: Record<string, unknown> | null;
}

/** The general-area circle shown for local tasks (about a mile). */
export const PUBLIC_AREA_RADIUS_METERS = 1609;

export function budgetOf(row: Pick<PublicTaskRow, 'pricingType' | 'budgetCents' | 'hourlyRateCents' | 'estimatedHours' | 'hoursCap'>): PricingInput {
  if (row.pricingType === 'hourly') {
    return {
      type: 'hourly',
      rateCents: row.hourlyRateCents ?? 0,
      estimatedHours: row.estimatedHours ?? 0,
      hoursCap: row.hoursCap ?? 0,
    };
  }
  return { type: 'fixed', priceCents: row.budgetCents ?? 0 };
}

export function toTaskPublicView(row: PublicTaskRow): TaskPublicView {
  const taskType = taskTypeOf(row.categorySlug as CategorySlug, row.details);
  const initials = `${row.poster.firstName.charAt(0)}${row.poster.lastName.charAt(0)}`.toUpperCase();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: row.categorySlug as CategorySlug,
    excerpt: publicExcerpt(row.description),
    location:
      row.mode === 'remote' || row.publicLat === null || row.publicLng === null || !row.areaName
        ? { kind: 'remote' }
        : {
            kind: 'local',
            marketSlug: row.marketSlug,
            marketName: row.marketName,
            areaName: row.areaName,
            publicPoint: { lat: row.publicLat, lng: row.publicLng },
            radiusMeters: PUBLIC_AREA_RADIUS_METERS,
          },
    schedule: {
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      flexible: row.flexible,
    },
    budget: budgetOf(row),
    offerCount: row.offerCount,
    status: row.status as TaskStatus,
    postedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    poster: {
      displayName: row.poster.name,
      initials,
      memberSince: row.poster.createdAt.toISOString(),
      phoneVerified: row.poster.phoneVerifiedAt !== null,
    },
    ...(taskType ? { taskType } : {}),
  };
}

export const BOARD_PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const AREA_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_PRICE_DOLLARS = 100_000;

function oneOf<T extends string>(value: string | undefined, options: readonly T[]): T | undefined {
  return value !== undefined && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

function dollars(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,6}$/.test(value.trim())) return undefined;
  const amount = Number.parseInt(value, 10);
  return amount <= MAX_PRICE_DOLLARS ? amount : undefined;
}

/** URL search params → the board's query with defaults (unknown values are ignored; completion plan 7.4). */
export function parseTaskBoardQuery(params: SearchParams): TaskBoardPageData['query'] {
  const category = oneOf(first(params.category), CATEGORY_SLUGS);
  const type = first(params.type);
  const q = first(params.q)?.replace(/\s+/g, ' ').trim().slice(0, TASK_BOARD_Q_MAX);
  const areas = [...new Set((first(params.area) ?? '').split(',').map((slug) => slug.trim()).filter((slug) => AREA_SLUG.test(slug)))].slice(0, 12).sort();
  const times = TASK_BOARD_TIMES.filter((time) => (first(params.time) ?? '').split(',').includes(time));
  let minPrice = dollars(first(params.min));
  let maxPrice = dollars(first(params.max));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const page = Number.parseInt(first(params.page) ?? '1', 10);
  const pricing = oneOf(first(params.pricing), ['fixed', 'hourly'] as const);
  const posted = oneOf(first(params.posted), TASK_BOARD_POSTED);
  return {
    ...(category ? { category } : {}),
    ...(category && type && isTaskType(category, type) ? { type } : {}),
    ...(q ? { q } : {}),
    areas,
    ...(minPrice !== undefined && minPrice > 0 ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    ...(pricing ? { pricing } : {}),
    ...(posted ? { posted } : {}),
    times,
    few: first(params.few) === '1',
    when: oneOf(first(params.when), TASK_BOARD_WHEN) ?? 'any',
    remoteOnly: first(params.remote) === '1',
    sort: oneOf(first(params.sort), TASK_BOARD_SORTS) ?? 'soonest',
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
    view: oneOf(first(params.view), TASK_BOARD_VIEWS) ?? 'list',
    group: oneOf(first(params.group), TASK_BOARD_GROUPS) ?? 'area',
  };
}

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The time range a "when" filter covers, in the market's calendar: today; this week (through
 * Sunday); this weekend (Saturday and Sunday, or the rest of it if it's already the weekend).
 */
export function whenRange(when: TaskBoardWhen, now: Date): { from: Date; to: Date } | null {
  if (when === 'any') return null;
  const today = marketDayKey(now);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const startOf = (dayKey: string) => new Date(marketLocalToUtc(dayKey, '00:00'));
  if (when === 'today') return { from: now, to: startOf(addDays(today, 1)) };
  const daysToMonday = weekday === 0 ? 1 : 8 - weekday;
  if (when === 'this_week') return { from: now, to: startOf(addDays(today, daysToMonday)) };
  // this_weekend
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = addDays(today, daysToSaturday);
  const from = weekday === 6 || weekday === 0 ? now : startOf(saturday);
  return { from, to: startOf(addDays(saturday, 2)) };
}
