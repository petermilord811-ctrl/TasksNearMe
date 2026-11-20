/**
 * The demo marketplace as plain data (no database): Austin's hand-written cast (54 clients, 28 helpers, 216 tasks)
 * and 14 more markets with generated people (./markets.ts: 13 cities and Pretty Prairie, Kansas; 1,000 tasks), each
 * with offers, bookings, payments, reviews and conversations that follow the app's own rules.
 *
 * - Clients post what fits their home and household: yard work only from houses, the bedrooms and floor of their
 *   own place, in their own neighborhood (one saved address each), at the market's prices.
 * - Only helpers who could really offer do: same market, they offer the category, are bookable in it (a background
 *   check for in-home work), cover the task's public point within their radius (or work remotely), price near the
 *   budget, and were set up before the offer.
 * - A client books the best fit: a helper they liked before, then rating and price. A helper is never booked twice
 *   at the same time.
 * - Money comes from the fee functions (`quoteBreakdown`, `finalBreakdown`) with each market's published fees;
 *   completed work has the helper's transfer and, for hourly work under the cap, the client's refund.
 * - Reviews are double-blind: published when both are in, or 14 days after completion.
 *
 * Times are relative to `now` (market time for windows), so a fresh run always has upcoming work. Each market has
 * its own seeded randomness: the same people, tasks and ids on every run, and adding a market changes no other.
 */
import type { CategorySlug, PriceBreakdown, PricingInput } from '@/contracts';
import { CLIENT_REVIEW_TAGS, EVIDENCE_CHECKLISTS, HELPER_REVIEW_TAGS } from '@/contracts';
import { distanceKm, fuzzedPublicPoint } from '@/modules/markets/geo';
import type { FeeSchedule } from '@/modules/markets/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { finalBreakdown, quoteBreakdown } from '@/modules/payments/fees';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { AUSTIN_AREAS, CATEGORIES } from '../data/austin';
import { GAINESVILLE, GAINESVILLE_AREAS, GAINESVILLE_POLICY_ID, gainesvilleAreaId } from '../data/gainesville';
import type { SeedPerson } from '../data/people';
import { DEMO_MARKETS, NAME_POOLS, demoAreaId, demoMarketId, demoPolicyId, type DemoMarket } from './markets';
import { AUSTIN_TO_GAINESVILLE_AREA, GAINESVILLE_AREA_STREETS, GAINESVILLE_HELPER_TEXT } from './gainesville-cast';
import { DEMO_CLIENTS, DEMO_HELPERS, HOUSEHOLD_NEEDS, type DemoClient, type DemoHelper, type HomeKind, type Household } from './people';
import { createRng, hashOf, type Rng } from './rng';
import {
  COMPLETION_NOTES,
  HELPER_TAG_WEIGHTS,
  bookingChat,
  clientReviewBody,
  helperBio,
  helperHeadline,
  helperReviewBody,
  offerMessage,
  templatesFor,
  type ClientHome,
  type DemoBudget,
  type TaskDraft,
} from './words';

/** Every demo id contains this (users, tasks, offers, bookings…), so the data can be told apart. */
export const DEMO_PREFIX = 'demo_';
const AUSTIN_SEED = 20261114;
const AUSTIN_TASK_COUNT = 216;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;
const KM_PER_MILE = 1.609344;
const REVIEW_WINDOW_MS = 14 * DAY;
const AUTO_APPROVE_MS = 72 * HOUR;
/** Base-seed handles, so demo handles never collide with them. */
const RESERVED_HANDLES = ['jordan-t', 'sam-k', 'lee-m', 'priya-s'];

export type DemoTaskStatus = 'open' | 'assigned' | 'completed' | 'canceled' | 'expired';
type Lifecycle = 'open' | 'confirmed' | 'in_progress' | 'completed' | 'canceled' | 'expired';

export interface DemoLocation {
  id: string;
  ownerUserId: string;
  address: { line1: string; line2?: string; city: string; state: string; zip: string; accessNotes?: string };
  zip: string;
  areaId: string;
}

export interface DemoTask {
  id: string;
  slug: string;
  posterUserId: string;
  marketId: string;
  categoryId: string;
  categorySlug: CategorySlug;
  title: string;
  description: string;
  details: Record<string, string | number | boolean>;
  mode: 'local' | 'remote';
  status: DemoTaskStatus;
  pricingType: 'fixed' | 'hourly';
  budgetCents: number | null;
  hourlyRateCents: number | null;
  estimatedHours: number | null;
  hoursCap: number | null;
  windowStart: Date;
  windowEnd: Date;
  flexible: boolean;
  locationId: string | null;
  publicAreaId: string | null;
  publicLat: number | null;
  publicLng: number | null;
  offerCount: number;
  publishedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoOffer {
  id: string;
  taskId: string;
  helperUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  pricingType: 'fixed' | 'hourly';
  priceCents: number | null;
  hourlyRateCents: number | null;
  estimatedHours: number | null;
  hoursCap: number | null;
  proposedStart: Date;
  message: string;
  brings: string[];
  expiresAt: Date;
  revision: number;
  posterSeenAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoReview {
  id: string;
  authorUserId: string;
  subjectUserId: string;
  direction: 'client_to_helper' | 'helper_to_client';
  categoryId: string;
  rating: number;
  tags: string[];
  body: string | null;
  status: 'submitted' | 'published';
  publishedAt: Date | null;
  createdAt: Date;
}

export interface DemoBooking {
  id: string;
  taskId: string;
  offerId: string;
  posterUserId: string;
  helperUserId: string;
  marketId: string;
  /** The market's published policy the booking was made under. */
  policyVersionId: string;
  status: 'confirmed' | 'in_progress' | 'completed';
  startAt: Date;
  confirmedAt: Date;
  onMyWayAt: Date | null;
  arrivedAt: Date | null;
  completionSubmittedAt: Date | null;
  completedVia: 'poster' | 'auto' | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  terms: {
    pricingType: 'fixed' | 'hourly';
    priceCents: number | null;
    hourlyRateCents: number | null;
    estimatedHours: number | null;
    hoursCap: number | null;
    breakdown: PriceBreakdown;
    scopeText: string;
  };
  payment: { amountCents: number; status: 'succeeded' | 'partially_refunded'; brand: string; last4: string; expMonth: number; expYear: number };
  completion: { submittedAt: Date; note: string; hoursWorked: number | null; finalBreakdown: PriceBreakdown; checklist: Record<string, boolean> } | null;
  earning: { amountCents: number; at: Date } | null;
  refund: { amountCents: number; at: Date } | null;
  reviews: DemoReview[];
  chat: { senderUserId: string; body: string; at: Date }[];
}

export interface DemoAvailability {
  id: string;
  helperUserId: string;
  marketId: string;
  categoryId: string;
  startAt: Date;
  endAt: Date;
  pricingType: 'fixed' | 'hourly';
  priceCents: number | null;
  hourlyRateCents: number | null;
  estimatedHours: number | null;
  hoursCap: number | null;
  createdAt: Date;
}

export interface DemoPlan {
  people: SeedPerson[];
  /** Where each client lives (for checks; the address itself is in `locations`). */
  clients: { userId: string; marketId: string; areaId: string; home: HomeKind }[];
  /** Helper profile numbers that come from the plan (the writer stores them after the profiles). */
  helperStats: { userId: string; completedCount: number }[];
  locations: DemoLocation[];
  tasks: DemoTask[];
  offers: DemoOffer[];
  bookings: DemoBooking[];
  savedHelpers: { userId: string; helperUserId: string; createdAt: Date }[];
  availability: DemoAvailability[];
}

/** Each market's published policy (id and fees), by market id. */
export type DemoPolicies = Record<string, { id: string; fees: FeeSchedule }>;

/** The policies the writer creates (and Gainesville's, from the base seed and migration 0061), all with the default fees. */
export function defaultDemoPolicies(): DemoPolicies {
  return Object.fromEntries([[GAINESVILLE.id, { id: GAINESVILLE_POLICY_ID, fees: DEFAULT_FEES }], ...DEMO_MARKETS.map((market) => [demoMarketId(market), { id: demoPolicyId(market), fees: DEFAULT_FEES }])]);
}

interface AreaRef {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  zip: string;
  streets: string[];
  /** Tall buildings: apartments on higher floors. */
  highRise: boolean;
  /** What people call it in addresses and their own words (defaults to `name`). */
  label: string;
}

interface MarketRun {
  marketId: string;
  /** In ids after `demo_`: '' for Austin (its ids came first), `<key>_` for the others. */
  tag: string;
  pad: number;
  slugHashLength: number;
  areaCode: string;
  state: string;
  cityOf: (area: AreaRef) => string;
  areas: Map<string, AreaRef>;
  rural: boolean;
  priceFactor: number;
  policy: { id: string; fees: FeeSchedule };
  /** Every client posts at least once before the rest are spread by activity (generated markets). */
  everyClientPosts: boolean;
  /** One helper in this many shares open time slots. */
  availabilityEvery: number;
  /** The market's IANA zone: its tasks' days and times are on this clock. */
  timeZone: string;
}

interface HelperRef {
  spec: DemoHelper;
  userId: string;
  firstName: string;
  area: AreaRef;
  radiusMiles: number;
  remoteOk: boolean;
  bookable: Set<CategorySlug>;
  bookableFrom: Date;
  services: Map<CategorySlug, { pricingType: 'fixed' | 'hourly'; cents: number }>;
  /** Booked time ranges, so nobody is booked twice at once. */
  busy: Array<[number, number]>;
}

interface ClientRef {
  spec: DemoClient;
  userId: string;
  area: AreaRef;
  home: ClientHome;
  locationId: string;
  /** Helpers this client rated five stars, most recent last. */
  liked: string[];
  openCount: number;
}

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((category) => [category.slug as CategorySlug, category]));
const GENERIC_STREETS = ['Example Lane', 'Sample Street', 'Placeholder Avenue', 'Demo Court', 'Specimen Drive', 'Mockup Road', 'Template Way', 'Prototype Trail'];

const TOOL_FIT: Record<CategorySlug, string[]> = {
  'furniture-assembly': ['Drill', 'Hex keys', 'Level', 'Stud finder'],
  'moving-help': ['Moving straps', 'Furniture blankets', 'Dolly'],
  'yard-cleanup': ['Rake', 'Leaf blower', 'Pruning shears', 'Yard bags'],
  'light-cleaning': ['Microfiber cloths', 'Cleaning supplies', 'Vacuum'],
  'computer-help': ['Laptop', 'USB drives', 'Ethernet cable'],
};

const SERVICE_WORDS: Record<CategorySlug, string[]> = {
  'furniture-assembly': ['Desks, beds, dressers, shelves and wardrobes. Wall anchoring on request.', 'Flat-pack furniture of every size, built level and sturdy.'],
  'moving-help': ['Loading and unloading rental trucks, and moving furniture within your home. No vehicle.', 'Carrying the heavy pieces safely, with straps and blankets.'],
  'yard-cleanup': ['Leaves, weeds, shrubs and storm branches, bagged for curbside pickup.', 'Raking, weeding and light pruning by hand.'],
  'light-cleaning': ['Kitchens, bathrooms, dusting and floors. Supplies included on request.', 'Regular light cleaning and tidy-ups before guests.'],
  'computer-help': ['Setup, fixes, backups and how-to help, in person or by screen share.', 'New devices, printers, Wi-Fi and moving files.'],
};

/** A generated helper's "from" price or hourly rate in Austin, before the market's price factor. */
const BASE_SERVICE_CENTS: Record<CategorySlug, [number, number]> = {
  'furniture-assembly': [4500, 6000],
  'moving-help': [3500, 4000],
  'yard-cleanup': [6000, 7500],
  'light-cleaning': [9000, 11000],
  'computer-help': [3500, 5000],
};
const OTHER_LANGUAGES = ['vi', 'zh', 'ar', 'ko', 'tl', 'fr', 'de', 'hi'];
/** The lowest hourly rate a demo market goes to, per category (posting needs rate × hours ≥ the minimum). */
const HOURLY_FLOOR: Partial<Record<CategorySlug, number>> = { 'moving-help': 3000, 'yard-cleanup': 2500 };

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function addDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The generated demo markets' clock (completion plan 8.1): all fourteen are Central-time cities (./markets.ts, write.ts).
 * The hand-written cast runs on its own market's clock, Gainesville's (Eastern), since it moved there (owner, 2026-11-17).
 */
export const DEMO_TIME_ZONE = 'America/Chicago';

function clockLabel(date: Date, timeZone: string): string {
  const [h, m] = marketClockTime(date, timeZone).split(':').map(Number) as [number, number];
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

const roundTo5Dollars = (cents: number) => Math.round(cents / 500) * 500;
const roundQuarter = (hours: number) => Math.round(hours * 4) / 4;

/** A price in Austin, moved to the market's level (never below the category's minimum). */
function scaleBudget(budget: DemoBudget, factor: number, category: CategorySlug): DemoBudget {
  if (factor === 1) return budget;
  const row = CATEGORY_BY_SLUG.get(category)!;
  if (budget.type === 'fixed') return { type: 'fixed', priceCents: Math.max(row.minPriceCents, roundTo5Dollars(budget.priceCents * factor)) };
  return { ...budget, rateCents: Math.max(HOURLY_FLOOR[category] ?? 2500, Math.round((budget.rateCents * factor) / 100) * 100) };
}

function weightedTags(rng: Rng, weights: Record<string, number>, count: number): string[] {
  const pool = Object.entries(weights);
  const out: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const tag = rng.weighted(pool.map(([key, weight]) => [key, weight] as const));
    out.push(tag);
    pool.splice(
      pool.findIndex(([key]) => key === tag),
      1,
    );
  }
  return out;
}

/** Generated helpers for a market: spread over its neighborhoods by activity, with every category covered twice. */
function generateHelpers(market: DemoMarket, rng: Rng, names: Set<string>): DemoHelper[] {
  const count = Math.max(10, Math.round(market.taskCount / 4.5));
  const categoryWeights: Array<readonly [CategorySlug, number]> = market.rural
    ? [['yard-cleanup', 4], ['furniture-assembly', 3], ['moving-help', 2.5], ['light-cleaning', 2], ['computer-help', 1.5]]
    : [['furniture-assembly', 3], ['light-cleaning', 3], ['moving-help', 2.5], ['computer-help', 2], ['yard-cleanup', 1.5]];
  const specs: DemoHelper[] = [];
  let founding = 0;
  for (let i = 0; i < count; i++) {
    const [firstName, lastName] = uniqueName(rng, names);
    const area = rng.weighted(market.areas.map((candidate) => [candidate, candidate.weight ?? 1] as const));
    const serviceCount = rng.weighted([[1, 3], [2, 5], [3, 2]] as const);
    const categories: CategorySlug[] = [];
    while (categories.length < serviceCount) {
      const category = rng.weighted(categoryWeights.filter(([slug]) => !categories.includes(slug)));
      categories.push(category);
    }
    specs.push(helperSpec(market, rng, { key: `h${String(i + 1).padStart(3, '0')}`, firstName, lastName, area: area.slug, categories, founding: rng.chance(0.6) ? ++founding : undefined }));
  }
  // Every category has at least two helpers in the market (added to people with fewer services).
  for (const [category] of categoryWeights) {
    let missing = 2 - specs.filter((spec) => spec.services.some((service) => service.category === category)).length;
    for (const spec of [...specs].sort((x, y) => x.services.length - y.services.length || x.key.localeCompare(y.key))) {
      if (missing <= 0) break;
      if (spec.services.some((service) => service.category === category)) continue;
      spec.services.push({ category, cents: serviceCents(market, rng, category) });
      spec.tools = [...new Set([...spec.tools, ...TOOL_FIT[category].slice(0, 2)])];
      missing--;
    }
  }
  return specs;
}

function serviceCents(market: DemoMarket, rng: Rng, category: CategorySlug): number {
  const [low, high] = BASE_SERVICE_CENTS[category];
  const base = rng.int(low / 500, high / 500) * 500;
  if (CATEGORY_BY_SLUG.get(category)!.defaultPricingType === 'hourly') return Math.max(HOURLY_FLOOR[category] ?? 2500, Math.round((base * market.priceFactor) / 100) * 100);
  return Math.max(CATEGORY_BY_SLUG.get(category)!.minPriceCents, roundTo5Dollars(base * market.priceFactor));
}

function helperSpec(
  market: DemoMarket,
  rng: Rng,
  input: { key: string; firstName: string; lastName: string; area: string; categories: CategorySlug[]; founding: number | undefined },
): DemoHelper {
  const area = market.areas.find((candidate) => candidate.slug === input.area)!;
  const spanish = rng.chance(market.spanish);
  const languages = ['en', ...(spanish ? ['es'] : []), ...(rng.chance(0.06) ? [rng.pick(OTHER_LANGUAGES)] : [])];
  const tools = [...new Set(input.categories.flatMap((category) => rng.shuffle(TOOL_FIT[category]).slice(0, rng.int(2, 3))))];
  const newcomer = rng.chance(0.1);
  return {
    key: input.key,
    firstName: input.firstName,
    lastName: input.lastName,
    area: input.area,
    radiusMiles: market.rural ? rng.weighted([[15, 7], [12, 3]] as const) : rng.weighted([[5, 25], [8, 45], [12, 25], [15, 5]] as const),
    services: input.categories.map((category) => ({ category, cents: serviceCents(market, rng, category) })),
    languages,
    tools,
    headline: helperHeadline(rng, input.categories[0]!, area.label ?? area.name, market.name),
    bio: helperBio(rng, { services: input.categories, area: area.label ?? area.name, market: market.name, rural: market.rural === true, spanish }),
    fiveStarRate: Math.round((0.74 + rng.next() * 0.22) * 100) / 100,
    responseMinutes: market.rural ? rng.int(30, 180) : rng.int(15, 90),
    joinedDaysAgo: newcomer ? rng.int(6, 14) : rng.int(30, 85),
    ...(input.founding ? { foundingNumber: input.founding } : {}),
  };
}

/** Generated clients: about one for every 3.4 tasks, in the market's neighborhoods, apartments where they're common. */
function generateClients(market: DemoMarket, rng: Rng, names: Set<string>): DemoClient[] {
  const count = Math.ceil(market.taskCount / 3.4);
  const clients: DemoClient[] = [];
  for (let i = 0; i < count; i++) {
    const [firstName, lastName] = uniqueName(rng, names);
    // One client in every neighborhood first, so each has work; then by how busy each one is.
    const area = i < market.areas.length ? market.areas[i]! : rng.weighted(market.areas.map((candidate) => [candidate, candidate.weight ?? 1] as const));
    const home: HomeKind = rng.chance(area.apartments) ? 'apartment' : 'house';
    const household: Household =
      home === 'apartment'
        ? rng.weighted<Household>([['professional', 3], ['student', market.rural ? 0.3 : 2], ['newcomer', 2], ['host', 1], ['senior', 1], ['family', 1]])
        : rng.weighted<Household>([['family', 4], ['senior', 3], ['professional', 2], ['host', 1.5], ['newcomer', 1]]);
    clients.push({ key: `c${String(i + 1).padStart(3, '0')}`, firstName, lastName, area: area.slug, home, household, ...(rng.chance(market.spanish * 0.5) ? { locale: 'es' as const } : {}) });
  }
  return clients;
}

function uniqueName(rng: Rng, names: Set<string>): [string, string] {
  for (;;) {
    const first = rng.pick(NAME_POOLS.first);
    const last = rng.pick(NAME_POOLS.last);
    const key = `${first} ${last}`;
    if (names.has(key)) continue;
    names.add(key);
    return [first, last];
  }
}

export function buildDemoPlan(input: { now: Date; policies: DemoPolicies }): DemoPlan {
  const { now, policies } = input;
  const nowMs = now.getTime();

  const people: SeedPerson[] = [];
  const clientsOut: DemoPlan['clients'] = [];
  const helperStats: DemoPlan['helperStats'] = [];
  const locations: DemoLocation[] = [];
  const tasks: DemoTask[] = [];
  const offers: DemoOffer[] = [];
  const bookings: DemoBooking[] = [];
  const savedHelpers = new Map<string, { userId: string; helperUserId: string; createdAt: Date }>();
  const availability: DemoAvailability[] = [];
  const handles = new Set(RESERVED_HANDLES);
  const emails = new Set<string>();
  const names = new Set([...DEMO_CLIENTS, ...DEMO_HELPERS].map((person) => `${person.firstName} ${person.lastName}`));

  const policyOf = (marketId: string) => {
    const policy = policies[marketId];
    if (!policy) throw new Error(`Demo data: no published policy for ${marketId}`);
    return policy;
  };

  /** One market from people to bookings, with its own randomness (the order of draws is the plan's identity). */
  function runMarket(run: MarketRun, rng: Rng, helperSpecs: DemoHelper[], clientSpecs: DemoClient[], taskCount: number): void {
    // Days and times on this market's own clock.
    const today = marketDayKey(now, run.timeZone);
    const localHour = Number(marketClockTime(now, run.timeZone).slice(0, 2));
    const at = (dayKey: string, time: string) => new Date(marketLocalToUtc(dayKey, time, run.timeZone));
    const ids = {
      user: (key: string) => `usr_${DEMO_PREFIX}${run.tag}${key}`,
      num: (num: number) => `${run.tag}${String(num).padStart(run.pad, '0')}`,
    };

    // People ---------------------------------------------------------------------------------------------------
    const helpers: HelperRef[] = helperSpecs.map((spec, index) => {
      const area = run.areas.get(spec.area);
      if (!area) throw new Error(`Demo helper ${run.tag}${spec.key}: unknown area ${spec.area}`);
      const joined = at(addDayKey(today, -spec.joinedDaysAgo), '10:00');
      const needsBackground = spec.services.some((service) => CATEGORY_BY_SLUG.get(service.category)?.requiresBackgroundCheck);
      const idAt = new Date(joined.getTime() + DAY);
      const addressAt = new Date(joined.getTime() + 2 * DAY);
      const payoutsAt = new Date(joined.getTime() + 2 * DAY + 2 * HOUR);
      const backgroundAt = needsBackground ? new Date(joined.getTime() + 4 * DAY) : null;
      let handle = slugify(`${spec.firstName}-${spec.lastName.charAt(0)}`);
      for (let n = 2; handles.has(handle); n++) handle = slugify(`${spec.firstName}-${spec.lastName.charAt(0)}${n}`);
      handles.add(handle);
      const userId = ids.user(spec.key);
      const street = rng.pick(area.streets);
      const services = new Map<CategorySlug, { pricingType: 'fixed' | 'hourly'; cents: number }>();
      for (const service of spec.services) {
        const hourly = CATEGORY_BY_SLUG.get(service.category)?.defaultPricingType === 'hourly';
        services.set(service.category, { pricingType: hourly ? 'hourly' : 'fixed', cents: service.cents });
      }
      const email = `${handle}.demo@example.test`;
      emails.add(email);
      people.push({
        id: userId,
        email,
        firstName: spec.firstName,
        lastName: spec.lastName,
        mode: 'helper',
        phone: `+1${run.areaCode}555${3001 + index}`,
        homeMarketId: run.marketId,
        createdAt: joined.toISOString(),
        helper: {
          handle,
          headline: spec.headline,
          bio: spec.bio,
          status: 'active',
          areaId: area.id,
          serviceRadiusKm: Math.round(spec.radiusMiles * KM_PER_MILE),
          remoteOk: services.has('computer-help'),
          tools: spec.tools,
          languages: spec.languages,
          ...(spec.foundingNumber ? { foundingNumber: spec.foundingNumber } : {}),
          idVerifiedAt: idAt.toISOString(),
          homeAddress: { verifiedAt: addressAt.toISOString(), line1: `${rng.int(100, 4999)} ${street}`, zip: area.zip },
          ...(backgroundAt ? { backgroundCheckedAt: backgroundAt.toISOString() } : {}),
          payoutsReadyAt: payoutsAt.toISOString(),
          completedCount: 0,
          ratingCount: 0,
          responseTimeMinutes: spec.responseMinutes,
          services: [...services].map(([category, service]) => ({
            categoryId: CATEGORY_BY_SLUG.get(category)!.id,
            pricingType: service.pricingType,
            ...(service.pricingType === 'hourly' ? { hourlyRateCents: service.cents, minHours: 2 } : { fromPriceCents: service.cents }),
            description: rng.pick(SERVICE_WORDS[category]),
          })),
        },
      });
      const bookable = new Set<CategorySlug>(
        spec.services.map((service) => service.category).filter((category) => !CATEGORY_BY_SLUG.get(category)?.requiresBackgroundCheck || backgroundAt !== null),
      );
      const bookableFrom = new Date(Math.max(idAt.getTime(), addressAt.getTime(), payoutsAt.getTime(), backgroundAt?.getTime() ?? 0));
      return { spec, userId, firstName: spec.firstName, area, radiusMiles: spec.radiusMiles, remoteOk: services.has('computer-help'), bookable, bookableFrom, services, busy: [] };
    });

    const marketLocations: DemoLocation[] = [];
    const clients: ClientRef[] = clientSpecs.map((spec) => {
      const area = run.areas.get(spec.area);
      if (!area) throw new Error(`Demo client ${run.tag}${spec.key}: unknown area ${spec.area}`);
      const apartment = spec.home === 'apartment';
      const floor = apartment ? (area.highRise ? rng.int(4, 24) : rng.int(1, 4)) : 1;
      const bedrooms = apartment ? rng.int(0, 2) : rng.int(2, 4);
      const home: ClientHome = {
        kind: spec.home,
        household: spec.household,
        floor,
        elevator: apartment && (floor >= 4 || rng.chance(0.3)),
        bedrooms,
        bathrooms: apartment ? Math.min(bedrooms + 1, rng.int(1, 2)) : rng.int(1, Math.min(3, bedrooms)),
        pets: rng.chance(0.35),
      };
      const userId = ids.user(spec.key);
      const locationId = `loc_${DEMO_PREFIX}${run.tag}${spec.key}`;
      marketLocations.push({
        id: locationId,
        ownerUserId: userId,
        address: {
          line1: `${rng.int(100, 4999)} ${rng.pick(area.streets)}`,
          ...(apartment ? { line2: `Apt ${floor}${rng.pick(['A', 'B', 'C', 'D'])}` } : {}),
          city: run.cityOf(area),
          state: run.state,
          zip: area.zip,
          ...(rng.chance(0.4) ? { accessNotes: rng.pick(apartment ? ['Call box under my last name.', 'Elevator is past the mailboxes.', 'Guest parking on level 2.'] : ['Side gate is unlocked.', 'Please park on the street.', 'Knock loudly, the bell is broken.']) } : {}),
        },
        zip: area.zip,
        areaId: area.id,
      });
      return { spec, userId, area, home, locationId, liked: [], openCount: 0 };
    });

    // Tasks: who posts what, and where it is in its life -----------------------------------------------------
    interface Draft {
      num: number;
      id: string;
      client: ClientRef;
      category: CategorySlug;
      draft: TaskDraft;
      lifecycle: Lifecycle;
      point: { lat: number; lng: number } | null;
    }
    const activity = (client: ClientRef) => ({ family: 3, professional: 3, host: 2, newcomer: 2, senior: 2, student: 2 })[client.spec.household];
    const drafts: Draft[] = [];
    for (let num = 1; num <= taskCount; num++) {
      const client = run.everyClientPosts && num <= clients.length ? clients[num - 1]! : rng.weighted(clients.map((c) => [c, activity(c)] as const));
      const needs = Object.entries(HOUSEHOLD_NEEDS[client.spec.household]).filter(([category]) => templatesFor(category as CategorySlug, client.home, run.rural).length > 0);
      const category = rng.weighted(needs.map(([key, weight]) => [key as CategorySlug, weight] as const));
      const made = rng.pick(templatesFor(category, client.home, run.rural)).make(rng, client.home);
      const draft = { ...made, budget: scaleBudget(made.budget, run.priceFactor, category) };
      const id = `tsk_${DEMO_PREFIX}${ids.num(num)}`;
      const remote = draft.remote === true;
      const point = remote ? null : fuzzedPublicPoint({ lat: client.area.lat, lng: client.area.lng }, id);
      const lifecycle = rng.weighted<Lifecycle>([
        ['open', 44],
        ['confirmed', 10],
        ['in_progress', 3],
        ['completed', 34],
        ['canceled', 3],
        ['expired', 6],
      ]);
      drafts.push({ num, id, client, category, draft, lifecycle, point });
    }

    const milesTo = (helper: HelperRef, point: { lat: number; lng: number }) => distanceKm({ lat: helper.area.lat, lng: helper.area.lng }, point) / KM_PER_MILE;
    /** Helpers who could offer on the task at `when`: the app's offer rules, plus a price near the budget. */
    const eligible = (task: Draft, when: Date) =>
      helpers.filter((helper) => {
        if (!helper.bookable.has(task.category) || helper.bookableFrom.getTime() > when.getTime()) return false;
        if (task.point === null ? !helper.remoteOk : milesTo(helper, task.point) > helper.radiusMiles) return false;
        const service = helper.services.get(task.category)!;
        const budget = task.draft.budget;
        if (budget.type === 'fixed') return service.pricingType === 'hourly' || service.cents <= budget.priceCents * 1.25;
        return service.pricingType === 'fixed' || service.cents <= budget.rateCents * 1.25;
      });

    // Past work first, oldest first, so "booked again" and the helpers' calendars build up in order.
    const order: Lifecycle[] = ['completed', 'expired', 'canceled', 'in_progress', 'confirmed', 'open'];
    const timeline = new Map<string, number>();
    for (const task of drafts) {
      const offset =
        task.lifecycle === 'completed' ? -rng.int(2, 45)
        : task.lifecycle === 'expired' ? -rng.int(1, 12)
        : task.lifecycle === 'canceled' ? rng.int(-5, 10)
        : task.lifecycle === 'in_progress' ? 0
        : task.lifecycle === 'confirmed' ? rng.int(1, 8)
        : rng.int(1, 12);
      timeline.set(task.id, offset);
    }
    drafts.sort((a, b) => order.indexOf(a.lifecycle) - order.indexOf(b.lifecycle) || timeline.get(a.id)! - timeline.get(b.id)! || a.num - b.num);

    const marketTasks: DemoTask[] = [];
    const completedBy = new Map<string, number>();
    const windows: Array<[string, string]> = [['08:00', '12:00'], ['09:00', '13:00'], ['10:00', '14:00'], ['13:00', '17:00'], ['14:00', '18:00'], ['17:00', '20:00']];
    const { fees } = run.policy;

    for (const task of drafts) {
      const taskRng = createRng(hashOf(task.id));
      let lifecycle = task.lifecycle;
      // Work only happens in the daytime: outside 9–19 h, a job "in progress now" is a booking later instead.
      if (lifecycle === 'in_progress' && (localHour < 9 || localHour >= 19)) lifecycle = 'confirmed';
      // A client keeps at most three tasks open at once.
      if (lifecycle === 'open' && task.client.openCount >= 3) lifecycle = 'expired';
      const dayOffset = lifecycle === task.lifecycle ? timeline.get(task.id)! : lifecycle === 'confirmed' ? taskRng.int(1, 3) : -taskRng.int(1, 12);
      let dayKey = addDayKey(today, dayOffset);
      const flexible = lifecycle !== 'in_progress' && taskRng.chance(0.25);

      let windowStart: Date;
      let windowEnd: Date;
      let inProgressStart: Date | null = null;
      let timed: [string, string] | null = null;
      if (lifecycle === 'in_progress') {
        const started = nowMs - taskRng.int(40, 110) * MINUTE;
        inProgressStart = new Date(Math.floor(started / (30 * MINUTE)) * 30 * MINUTE);
        windowStart = new Date(inProgressStart.getTime() - 60 * MINUTE);
        windowEnd = new Date(Math.min(inProgressStart.getTime() + (task.draft.workHours + 2) * HOUR, at(dayKey, '23:30').getTime()));
      } else if (flexible) {
        windowStart = at(dayKey, '00:00');
        windowEnd = at(dayKey, '23:59');
      } else {
        const [start, end] = taskRng.pick(windows);
        windowStart = at(dayKey, start);
        windowEnd = at(dayKey, end);
        timed = [start, end];
      }
      // Open tasks follow posting (sweep 2026-11-20): a window starts no sooner than the 3-hour lead allows. Offers
      // expire at its start and the boards drop the task then, so one already under way would be open in name only.
      if (lifecycle === 'open' && windowStart.getTime() < nowMs + 3 * HOUR) {
        const earliest = Math.ceil((nowMs + 3 * HOUR) / (30 * MINUTE)) * 30 * MINUTE;
        if (flexible && earliest + 3 * HOUR <= windowEnd.getTime()) windowStart = new Date(earliest);
        else {
          dayKey = addDayKey(dayKey, 1);
          windowStart = at(dayKey, flexible ? '00:00' : timed![0]);
          windowEnd = at(dayKey, flexible ? '23:59' : timed![1]);
        }
      }

      // When it was posted: like the posting form, the start is 3 hours to 14 days after posting.
      let publishedAt: Date;
      if (lifecycle === 'open') {
        const hoursAgo = Math.min(taskRng.int(1, 110), Math.floor((nowMs + 13 * DAY - windowStart.getTime()) / HOUR));
        publishedAt = new Date(nowMs - Math.max(hoursAgo, 1) * HOUR - taskRng.int(0, 59) * MINUTE);
      } else if (lifecycle === 'confirmed' || lifecycle === 'in_progress') publishedAt = new Date(Math.min(nowMs - 6 * HOUR, windowStart.getTime() - 12 * HOUR) - taskRng.int(1, 4) * DAY - taskRng.int(0, 12) * HOUR);
      else if (lifecycle === 'canceled') publishedAt = new Date(Math.min(windowStart.getTime() - taskRng.int(2, 6) * DAY, nowMs - taskRng.int(2, 48) * HOUR));
      else publishedAt = new Date(windowStart.getTime() - taskRng.int(1, 6) * DAY - taskRng.int(0, 12) * HOUR);

      const remote = task.point === null;
      const draft = task.draft;
      const budget = draft.budget;
      const categoryRow = CATEGORY_BY_SLUG.get(task.category)!;
      const base: DemoTask = {
        id: task.id,
        slug: `${slugify(draft.title)}-${remote ? 'remote' : task.client.area.slug}-${hashOf(task.id).toString(36).padStart(run.slugHashLength, '0').slice(0, run.slugHashLength)}`,
        posterUserId: task.client.userId,
        marketId: run.marketId,
        categoryId: categoryRow.id,
        categorySlug: task.category,
        title: draft.title,
        description: draft.description,
        details: draft.details,
        mode: remote ? 'remote' : 'local',
        status: 'open',
        pricingType: budget.type,
        budgetCents: budget.type === 'fixed' ? budget.priceCents : null,
        hourlyRateCents: budget.type === 'hourly' ? budget.rateCents : null,
        estimatedHours: budget.type === 'hourly' ? budget.estimatedHours : null,
        hoursCap: budget.type === 'hourly' ? budget.hoursCap : null,
        windowStart,
        windowEnd,
        flexible,
        locationId: remote ? null : task.client.locationId,
        publicAreaId: remote ? null : task.client.area.id,
        publicLat: task.point?.lat ?? null,
        publicLng: task.point?.lng ?? null,
        offerCount: 0,
        publishedAt,
        expiresAt: windowEnd,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      };

      if (lifecycle === 'canceled') {
        const canceledAt = new Date(Math.min(nowMs - HOUR, publishedAt.getTime() + taskRng.int(2, 40) * HOUR));
        marketTasks.push({ ...base, status: 'canceled', updatedAt: canceledAt });
        continue;
      }

      // Offers: from helpers who could, submitted after posting.
      const startTimes = (() => {
        const out: Date[] = [];
        // Within the window, as the offer form allows (a flexible day today starts later than 9:00).
        const from = flexible ? Math.max(at(dayKey, '09:00').getTime(), windowStart.getTime()) : windowStart.getTime();
        const until = flexible ? at(dayKey, '16:00').getTime() : windowEnd.getTime() - 30 * MINUTE;
        for (let t = from; t <= until; t += 30 * MINUTE) out.push(new Date(t));
        return out.length > 0 ? out : [windowStart];
      })();
      const offerTime = (latest: number, earliest = publishedAt.getTime() + 20 * MINUTE) => new Date(earliest + Math.floor(taskRng.next() * Math.max(latest - earliest, MINUTE)));

      const decideBy = lifecycle === 'open' ? nowMs - 5 * MINUTE : lifecycle === 'expired' ? Math.min(windowStart.getTime(), nowMs) - HOUR : Math.min(publishedAt.getTime() + taskRng.int(6, 40) * HOUR, nowMs - 2 * HOUR, (inProgressStart ?? windowStart).getTime() - 3 * HOUR);
      // Open tasks: offers from the last 60 hours are still live (they last 72 hours).
      const earliestOffer = lifecycle === 'open' ? Math.max(publishedAt.getTime() + 20 * MINUTE, nowMs - 60 * HOUR) : publishedAt.getTime() + 20 * MINUTE;
      const candidates = eligible(task, new Date(earliestOffer));
      const wanted =
        lifecycle === 'open' ? taskRng.weighted([[0, 18], [1, 26], [2, 24], [3, 17], [4, 10], [5, 5]] as const)
        : lifecycle === 'expired' ? taskRng.weighted([[0, 3], [1, 2], [2, 1]] as const)
        : taskRng.int(1, 4);
      const liked = task.client.liked.filter((id) => candidates.some((helper) => helper.userId === id));
      let chosen = taskRng.shuffle(candidates).slice(0, Math.min(wanted, candidates.length));
      const rebookWith = liked.length > 0 && lifecycle !== 'open' && lifecycle !== 'expired' && taskRng.chance(0.6) ? liked[liked.length - 1]! : null;
      if (rebookWith && !chosen.some((helper) => helper.userId === rebookWith)) chosen = [helpers.find((helper) => helper.userId === rebookWith)!, ...chosen.slice(0, Math.max(wanted - 1, 0))];

      const madeOffers: Array<{ helper: HelperRef; offer: DemoOffer; workMs: number }> = [];
      chosen.forEach((helper) => {
        const service = helper.services.get(task.category)!;
        const submittedAt = offerTime(decideBy - 10 * MINUTE, earliestOffer);
        const proposedStart = inProgressStart ?? taskRng.pick(startTimes.slice(0, Math.max(1, Math.ceil(startTimes.length / 2))));
        let pricing: PricingInput;
        if (budget.type === 'fixed') {
          const asked = roundTo5Dollars(budget.priceCents * (0.9 + taskRng.next() * 0.25));
          const floor = service.pricingType === 'fixed' ? service.cents : categoryRow.minPriceCents;
          pricing = { type: 'fixed', priceCents: Math.max(asked, floor, categoryRow.minPriceCents) };
        } else {
          const rate = service.pricingType === 'hourly' ? service.cents : budget.rateCents;
          pricing = { type: 'hourly', rateCents: rate, estimatedHours: budget.estimatedHours, hoursCap: Math.max(budget.hoursCap, categoryRow.minHours ?? 0) };
        }
        const brings = helper.spec.tools.filter((tool) => TOOL_FIT[task.category].includes(tool)).slice(0, 2);
        const revised = taskRng.chance(0.1);
        const updatedAt = revised ? new Date(Math.min(submittedAt.getTime() + taskRng.int(1, 6) * HOUR, decideBy - MINUTE)) : submittedAt;
        const offer: DemoOffer = {
          id: `off_${DEMO_PREFIX}${ids.num(task.num)}_${helper.spec.key}`,
          taskId: task.id,
          helperUserId: helper.userId,
          status: 'pending',
          pricingType: pricing.type,
          priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
          hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
          estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
          hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
          proposedStart,
          message: offerMessage(taskRng, task.category, task.client.spec.firstName, clockLabel(proposedStart, run.timeZone)),
          brings,
          expiresAt: new Date(Math.min(windowStart.getTime(), submittedAt.getTime() + 72 * HOUR)),
          revision: revised ? 2 : 1,
          posterSeenAt: lifecycle === 'open' && taskRng.chance(0.45) ? null : new Date(Math.min(updatedAt.getTime() + taskRng.int(10, 300) * MINUTE, decideBy)),
          closedAt: null,
          createdAt: submittedAt,
          updatedAt,
        };
        madeOffers.push({ helper, offer, workMs: draft.workHours * HOUR });
      });

      /**
       * Nobody was booked. An offer past its 72 hours (or the window's start) expired, as the offers job does; the
       * task expired once its window ended, and is otherwise still open with the live offers.
       */
      const leaveUnbooked = () => {
        const live = madeOffers.filter(({ offer }) => offer.expiresAt.getTime() > nowMs).map(({ offer }) => offer);
        for (const { offer } of madeOffers) {
          offers.push(live.includes(offer) ? offer : { ...offer, status: 'expired', closedAt: offer.expiresAt, updatedAt: offer.expiresAt });
        }
        if (windowEnd.getTime() <= nowMs) {
          marketTasks.push({ ...base, status: 'expired', updatedAt: windowEnd });
          return;
        }
        task.client.openCount++;
        const updatedAt = live.reduce((latest, offer) => (offer.updatedAt > latest ? offer.updatedAt : latest), publishedAt);
        marketTasks.push({ ...base, offerCount: live.length, updatedAt });
      };

      if (lifecycle === 'open' || lifecycle === 'expired' || madeOffers.length === 0) {
        leaveUnbooked();
        continue;
      }

      // The client books: a helper they liked before, else the best rating for the price; never someone busy then.
      const free = madeOffers.filter(({ helper, offer, workMs }) => !helper.busy.some(([from, until]) => offer.proposedStart.getTime() < until && offer.proposedStart.getTime() + workMs + HOUR > from));
      if (free.length === 0) {
        leaveUnbooked();
        continue;
      }
      const priceOf = (offer: DemoOffer) => offer.priceCents ?? (offer.hourlyRateCents ?? 0) * (offer.estimatedHours ?? 1);
      const pick = [...free].sort((a, b) => {
        const score = (entry: (typeof free)[number]) => (entry.helper.userId === rebookWith ? 10 : 0) + entry.helper.spec.fiveStarRate * 3 - priceOf(entry.offer) / Math.max(priceOf(free[0]!.offer), 1);
        return score(b) - score(a);
      })[0]!;
      // Booked after the last offer came in, before the work starts, and before now.
      const lastOffer = Math.max(...madeOffers.map(({ offer }) => offer.updatedAt.getTime()));
      const bookedAt = new Date(Math.min(lastOffer + taskRng.int(20, 180) * MINUTE, nowMs - 10 * MINUTE, pick.offer.proposedStart.getTime() - 30 * MINUTE));
      const startAt = pick.offer.proposedStart;
      pick.helper.busy.push([startAt.getTime(), startAt.getTime() + pick.workMs + HOUR]);
      for (const { offer } of madeOffers) {
        offers.push(offer.id === pick.offer.id ? { ...offer, status: 'accepted', closedAt: bookedAt, updatedAt: bookedAt } : { ...offer, status: 'declined', closedAt: bookedAt, updatedAt: bookedAt });
      }

      const pricing: PricingInput =
        pick.offer.pricingType === 'fixed'
          ? { type: 'fixed', priceCents: pick.offer.priceCents! }
          : { type: 'hourly', rateCents: pick.offer.hourlyRateCents!, estimatedHours: pick.offer.estimatedHours!, hoursCap: pick.offer.hoursCap! };
      const funded = quoteBreakdown(fees, pricing);
      const helper = pick.helper;
      const card = taskRng.pick([
        { brand: 'visa', last4: '4242' },
        { brand: 'mastercard', last4: '4444' },
        { brand: 'visa', last4: '1881' },
        { brand: 'amex', last4: '0005' },
      ]);
      const booking: DemoBooking = {
        id: `bkg_${DEMO_PREFIX}${ids.num(task.num)}`,
        taskId: task.id,
        offerId: pick.offer.id,
        posterUserId: task.client.userId,
        helperUserId: helper.userId,
        marketId: run.marketId,
        policyVersionId: run.policy.id,
        status: 'confirmed',
        startAt,
        confirmedAt: bookedAt,
        onMyWayAt: null,
        arrivedAt: null,
        completionSubmittedAt: null,
        completedVia: null,
        completedAt: null,
        createdAt: bookedAt,
        updatedAt: bookedAt,
        terms: {
          pricingType: pricing.type,
          priceCents: pricing.type === 'fixed' ? pricing.priceCents : null,
          hourlyRateCents: pricing.type === 'hourly' ? pricing.rateCents : null,
          estimatedHours: pricing.type === 'hourly' ? pricing.estimatedHours : null,
          hoursCap: pricing.type === 'hourly' ? pricing.hoursCap : null,
          breakdown: funded,
          scopeText: draft.description,
        },
        payment: { amountCents: funded.posterChargedCents ?? funded.posterTotalCents, status: 'succeeded', brand: card.brand, last4: card.last4, expMonth: taskRng.int(1, 12), expYear: taskRng.int(2027, 2031) },
        completion: null,
        earning: null,
        refund: null,
        reviews: [],
        chat: [],
      };
      const tool = pick.offer.brings[0] ?? null;
      const chatAt = (ms: number) => new Date(Math.min(ms, nowMs - MINUTE));

      if (lifecycle === 'in_progress') {
        booking.status = 'in_progress';
        booking.onMyWayAt = new Date(startAt.getTime() - 20 * MINUTE);
        booking.arrivedAt = new Date(startAt.getTime() + taskRng.int(-5, 5) * MINUTE);
        booking.updatedAt = booking.arrivedAt;
      }

      if (lifecycle === 'completed') {
        const arrived = new Date(startAt.getTime() + taskRng.int(-6, 8) * MINUTE);
        let hoursWorked: number | null = null;
        if (pricing.type === 'hourly') hoursWorked = Math.min(pricing.hoursCap, Math.max(1, roundQuarter(pricing.estimatedHours + (taskRng.next() * 1.25 - 0.5))));
        const submitted = new Date(arrived.getTime() + (hoursWorked ?? draft.workHours) * HOUR);
        const auto = dayOffset <= -4 && taskRng.chance(0.15);
        const completedAt = auto ? new Date(submitted.getTime() + AUTO_APPROVE_MS) : new Date(submitted.getTime() + taskRng.int(30, 20 * 60) * MINUTE);
        const final = finalBreakdown(fees, funded, hoursWorked !== null ? { approvedHours: hoursWorked } : {});
        const checklist = Object.fromEntries(
          (EVIDENCE_CHECKLISTS[task.category] as readonly string[]).map((key) => [key, key === 'anchored_if_asked' ? draft.details.wallAnchoring === true : taskRng.chance(0.93)]),
        );
        Object.assign(booking, {
          status: 'completed',
          onMyWayAt: new Date(arrived.getTime() - taskRng.int(15, 30) * MINUTE),
          arrivedAt: arrived,
          completionSubmittedAt: submitted,
          completedVia: auto ? 'auto' : 'poster',
          completedAt,
          updatedAt: completedAt,
          completion: { submittedAt: submitted, note: taskRng.pick(COMPLETION_NOTES[task.category]), hoursWorked, finalBreakdown: final, checklist },
          earning: { amountCents: final.helperEarningsCents, at: completedAt },
          refund: (final.posterRefundCents ?? 0) > 0 ? { amountCents: final.posterRefundCents!, at: completedAt } : null,
        } satisfies Partial<DemoBooking>);
        if (booking.refund) booking.payment.status = 'partially_refunded';
        completedBy.set(helper.userId, (completedBy.get(helper.userId) ?? 0) + 1);

        // Reviews, double-blind.
        const clientReviews = taskRng.chance(0.85);
        const helperReviews = taskRng.chance(0.75);
        const rating = taskRng.chance(helper.spec.fiveStarRate) ? 5 : taskRng.chance(0.9) ? 4 : 3;
        const clientAt = new Date(Math.min(completedAt.getTime() + taskRng.int(1, 40) * HOUR, nowMs - 30 * MINUTE));
        const helperAt = new Date(Math.min(completedAt.getTime() + taskRng.int(1, 30) * HOUR, nowMs - 30 * MINUTE));
        const windowPassed = completedAt.getTime() + REVIEW_WINDOW_MS <= nowMs;
        const both = clientReviews && helperReviews;
        const publishedAt = (own: Date) => (both ? new Date(Math.max(clientAt.getTime(), helperAt.getTime())) : windowPassed ? new Date(completedAt.getTime() + REVIEW_WINDOW_MS) : own);
        const published = both || windowPassed;
        if (clientReviews) {
          booking.reviews.push({
            id: `rev_${DEMO_PREFIX}${ids.num(task.num)}_c`,
            authorUserId: task.client.userId,
            subjectUserId: helper.userId,
            direction: 'client_to_helper',
            categoryId: categoryRow.id,
            rating,
            tags: weightedTags(taskRng, HELPER_TAG_WEIGHTS[task.category], rating === 5 ? taskRng.int(1, 3) : rating === 4 ? taskRng.int(0, 2) : 0),
            body: rating === 3 ? 'It got done, but it took much longer than planned.' : helperReviewBody(taskRng, task.category, rating),
            status: published ? 'published' : 'submitted',
            publishedAt: published ? publishedAt(clientAt) : null,
            createdAt: clientAt,
          });
          if (rating === 5) {
            task.client.liked = [...task.client.liked.filter((id) => id !== helper.userId), helper.userId];
            if (taskRng.chance(0.5)) savedHelpers.set(`${task.client.userId}:${helper.userId}`, { userId: task.client.userId, helperUserId: helper.userId, createdAt: clientAt });
          }
        }
        if (helperReviews) {
          const clientRating = taskRng.chance(0.9) ? 5 : 4;
          booking.reviews.push({
            id: `rev_${DEMO_PREFIX}${ids.num(task.num)}_h`,
            authorUserId: helper.userId,
            subjectUserId: task.client.userId,
            direction: 'helper_to_client',
            categoryId: categoryRow.id,
            rating: clientRating,
            tags: weightedTags(taskRng, Object.fromEntries(CLIENT_REVIEW_TAGS.map((tag) => [tag, 1])), taskRng.int(1, 2)),
            body: clientReviewBody(taskRng),
            status: published ? 'published' : 'submitted',
            publishedAt: published ? publishedAt(helperAt) : null,
            createdAt: helperAt,
          });
        }
      }

      // A short conversation on the booking.
      const lines = bookingChat(taskRng, { clientFirstName: task.client.spec.firstName, helperFirstName: helper.firstName, tool, startLabel: clockLabel(startAt, run.timeZone), done: lifecycle === 'completed' });
      const times = [
        bookedAt.getTime() + taskRng.int(5, 60) * MINUTE,
        bookedAt.getTime() + taskRng.int(70, 240) * MINUTE,
        (booking.completionSubmittedAt?.getTime() ?? nowMs) + MINUTE,
        (booking.completedAt?.getTime() ?? nowMs) - MINUTE,
      ];
      booking.chat = lines.map(([who, body], index) => ({ senderUserId: who === 'client' ? task.client.userId : helper.userId, body, at: chatAt(times[index]!) }));
      booking.chat.sort((a, b) => a.at.getTime() - b.at.getTime());

      bookings.push(booking);
      marketTasks.push({ ...base, status: lifecycle === 'completed' ? 'completed' : 'assigned', offerCount: 0, updatedAt: booking.updatedAt });
    }

    // Open time slots for some of the helpers, on days they're free.
    for (const helper of helpers.filter((_, index) => index % run.availabilityEvery === 0)) {
      const [category, service] = [...helper.services][0]!;
      const categoryRow = CATEGORY_BY_SLUG.get(category)!;
      for (const days of [rng.int(2, 5), rng.int(6, 9)]) {
        const dayKey = addDayKey(today, days);
        const [from, to] = rng.pick([['09:00', '13:00'], ['13:00', '17:00']] as const);
        const startAt = at(dayKey, from);
        const endAt = at(dayKey, to);
        if (helper.busy.some(([busyFrom, busyUntil]) => startAt.getTime() < busyUntil && endAt.getTime() > busyFrom)) continue;
        const hourly = service.pricingType === 'hourly';
        availability.push({
          id: `avl_${DEMO_PREFIX}${run.tag}${helper.spec.key}_${days}`,
          helperUserId: helper.userId,
          marketId: run.marketId,
          categoryId: categoryRow.id,
          startAt,
          endAt,
          pricingType: hourly ? 'hourly' : 'fixed',
          priceCents: hourly ? null : service.cents,
          hourlyRateCents: hourly ? service.cents : null,
          estimatedHours: hourly ? 2 : null,
          hoursCap: hourly ? 3 : null,
          createdAt: new Date(nowMs - rng.int(2, 30) * HOUR),
        });
      }
    }

    // Clients joined a little before their first post.
    const firstPost = new Map<string, number>();
    for (const task of marketTasks) firstPost.set(task.posterUserId, Math.min(firstPost.get(task.posterUserId) ?? Infinity, task.createdAt.getTime()));
    clients.forEach((client, index) => {
      const first = firstPost.get(client.userId);
      const joined = first !== undefined ? new Date(first - rng.int(1, 20) * DAY - rng.int(0, 10) * HOUR) : new Date(nowMs - rng.int(3, 40) * DAY);
      const base = slugify(`${client.spec.firstName}.${client.spec.lastName}`).replaceAll('-', '.');
      let email = `${base}.demo@example.test`;
      for (let n = 2; emails.has(email); n++) email = `${base}${n}.demo@example.test`;
      emails.add(email);
      people.push({
        id: client.userId,
        email,
        firstName: client.spec.firstName,
        lastName: client.spec.lastName,
        mode: 'poster',
        phone: `+1${run.areaCode}555${2001 + index}`,
        homeMarketId: run.marketId,
        ...(client.spec.locale ? { locale: client.spec.locale } : {}),
        createdAt: joined.toISOString(),
      });
      clientsOut.push({ userId: client.userId, marketId: run.marketId, areaId: client.area.id, home: client.spec.home });
    });

    for (const helper of helpers) helperStats.push({ userId: helper.userId, completedCount: completedBy.get(helper.userId) ?? 0 });
    locations.push(...marketLocations.filter((location) => marketTasks.some((task) => task.locationId === location.id)));
    tasks.push(...marketTasks);
  }

  // The hand-written cast, with the ids and order of draws it has had from the start, in Gainesville since it became the
  // first city (owner, 2026-11-17). Its people still name the Austin neighborhoods they were written for, so the areas
  // are keyed by those and each maps to a Gainesville neighborhood of the same character (./gainesville-cast.ts).
  const castAreas = new Map(
    AUSTIN_AREAS.map((austinArea) => {
      const slug = AUSTIN_TO_GAINESVILLE_AREA[austinArea.slug]!;
      const area = GAINESVILLE_AREAS.find((candidate) => candidate.slug === slug)!;
      const streets = GAINESVILLE_AREA_STREETS[slug]!;
      const ref: AreaRef = { id: gainesvilleAreaId(slug), slug, name: area.name, lat: area.lat, lng: area.lng, zip: streets.zip, streets: streets.streets, highRise: slug === 'downtown', label: area.name };
      return [austinArea.slug, ref];
    }),
  );
  runMarket(
    {
      marketId: GAINESVILLE.id,
      tag: '',
      pad: 3,
      slugHashLength: 4,
      areaCode: '352',
      state: GAINESVILLE.state,
      cityOf: () => GAINESVILLE.name,
      areas: castAreas,
      rural: false,
      priceFactor: 1,
      policy: policyOf(GAINESVILLE.id),
      everyClientPosts: false,
      availabilityEvery: 3,
      timeZone: GAINESVILLE.timeZone,
    },
    createRng(AUSTIN_SEED),
    DEMO_HELPERS.map((helper) => ({ ...helper, ...GAINESVILLE_HELPER_TEXT[helper.key] })),
    DEMO_CLIENTS,
    AUSTIN_TASK_COUNT,
  );

  // The other markets: generated people, about 3.4 tasks per client and 4.5 per helper.
  for (const market of DEMO_MARKETS) {
    const rng = createRng(hashOf(`demo-market:${market.key}`));
    const helperSpecs = generateHelpers(market, rng, names);
    const clientSpecs = generateClients(market, rng, names);
    const areas = new Map(
      market.areas.map((area) => {
        const streets = rng.shuffle(GENERIC_STREETS).slice(0, 3);
        const ref: AreaRef = { id: demoAreaId(market, area), slug: area.slug, name: area.name, lat: area.lat, lng: area.lng, zip: area.zip, streets, highRise: area.apartments >= 0.8, label: area.label ?? area.name };
        return [area.slug, ref];
      }),
    );
    runMarket(
      {
        marketId: demoMarketId(market),
        tag: `${market.key}_`,
        pad: 4,
        slugHashLength: 6,
        areaCode: market.areaCode,
        state: market.state,
        cityOf: (area) => (market.rural ? area.label : market.name),
        areas,
        rural: market.rural === true,
        priceFactor: market.priceFactor,
        policy: policyOf(demoMarketId(market)),
        everyClientPosts: true,
        availabilityEvery: 4,
        timeZone: DEMO_TIME_ZONE,
      },
      rng,
      helperSpecs,
      clientSpecs,
      market.taskCount,
    );
  }

  tasks.sort((a, b) => a.id.localeCompare(b.id));
  return {
    people,
    clients: clientsOut,
    helperStats,
    locations,
    tasks,
    offers,
    bookings,
    savedHelpers: [...savedHelpers.values()],
    availability,
  };
}

/** For tests: the review tags the app accepts, per direction. */
export const REVIEW_TAGS = { client_to_helper: HELPER_REVIEW_TAGS, helper_to_client: CLIENT_REVIEW_TAGS } as const;
