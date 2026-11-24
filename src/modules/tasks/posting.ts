import { randomBytes } from 'node:crypto';
import { and, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import { posterIdentityRequirement } from '@/modules/trust/poster-risk';
import type { ActionResult, AddressSuggestion, CategorySlug, PostTaskPageData, PostTaskRepeat, TaskDraftInput, TaskPostingRules, TimeZone } from '@/contracts';
import { compactTaskDetails, createTaskDraftSchema, REPEAT_PLACE_PREFIX } from '@/contracts';
import { GeocoderUnavailableError, type GeoPlace, type Geocoder } from '@/integrations/geocoding';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { isUniqueViolation, violatedConstraint } from '@/platform/db/errors';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';
import { loadPhoneCheck, phoneGatePasses } from '../accounts/phone-check';
import { users } from '../accounts/schema';
import { cityAreaName, ensureCityArea, isCityAreaSlug, neighborhoodsOnly } from '../markets/city-areas';
import { fuzzedPublicPoint, inServiceArea, nearestArea } from '../markets/geo';
import { zipPoint } from '../markets/zip-points';
import { getMarketView, getPublishedPolicy, listCategoryViews } from '../markets/queries';
import { areas, categories, markets } from '../markets/schema';
import { findProhibitedPhrase, maskContactDetails } from '../trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '../trust/prohibited';
import { readExactAddress } from './locations';
import { templatesForCategories } from './templates';
import { files, taskLocations, taskPhotos, tasks } from './schema';

/** Posting a task (blueprint 02 J1, 06 §3): validation, safety checks, and creation in one place. */

export const POSTING_LIMITS = { maxPhotos: 8, maxPhotoMegabytes: 10, maxExpenseAllowanceCents: 50_000 } as const;
/** New accounts (first 7 days) may have at most 3 open tasks (blueprint 06 §3). */
export const NEW_ACCOUNT = { days: 7, maxOpenTasks: 3 } as const;
const POSTING_STATUSES = new Set(['active', 'restricted']);

export interface TaskPostingDeps {
  db: Db;
  geocoder: Geocoder;
  cipher: FieldCipher;
  now?: () => Date;
}

export type PostTaskOutcome = { ok: true; taskId: string; slug: string } | { ok: false; result: ActionResult };

function slugPart(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** "Post again" works from the poster's finished tasks (the task page offers it for these). */
const REPEATABLE = new Set(['completed', 'canceled', 'expired']);

/** The weekday of a market-local day ("2026-11-21"), 0 = Sunday. */
const weekdayOf = (day: string) => new Date(`${day}T12:00:00.000Z`).getUTCDay();
/** A market-local day `days` later on the calendar: whole days, whatever their length (a clock change's day is 23 or 25 h). */
const addDayKey = (day: string, days: number) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + days)).toISOString().slice(0, 10);

/**
 * The same window (or a flexible day) on the next date the posting rules allow: the same weekday as before when
 * one fits (people repeat weekly chores), otherwise the soonest allowed date.
 */
export function nextRepeatSchedule(
  task: { windowStart: Date; windowEnd: Date; flexible: boolean },
  rules: Pick<TaskPostingRules, 'minLeadHours' | 'maxLeadDays'>,
  at: Date,
  timeZone: TimeZone,
): TaskDraftInput['schedule'] {
  const window = task.flexible ? {} : { startTime: marketClockTime(task.windowStart, timeZone), endTime: marketClockTime(task.windowEnd, timeZone) };
  const weekday = weekdayOf(marketDayKey(task.windowStart, timeZone));
  const earliest = at.getTime() + rules.minLeadHours * 3_600_000;
  const latest = at.getTime() + rules.maxLeadDays * 86_400_000;
  let soonest: string | undefined;
  const today = marketDayKey(at, timeZone);
  for (let offset = 0; offset <= rules.maxLeadDays + 1; offset += 1) {
    // Calendar days, not 24-hour steps: the night the clocks spring forward, 24 h from just before midnight skipped a day.
    const day = addDayKey(today, offset);
    // As the draft schema checks it: the window's start, or (flexible) some of the day left after the lead time.
    const opens = new Date(marketLocalToUtc(day, window.startTime ?? '23:30', timeZone)).getTime();
    const begins = new Date(marketLocalToUtc(day, window.startTime ?? '00:00', timeZone)).getTime();
    if (opens < earliest || begins > latest) continue;
    soonest ??= day;
    if (weekdayOf(day) === weekday) return { date: day, flexible: task.flexible, ...window };
  }
  return { date: soonest ?? '', flexible: task.flexible, ...window };
}

/** Window starts fall on the half hour, as the offer form's start times do. */
const HALF_HOUR_MS = 30 * 60_000;

export function createTaskPosting({ db, geocoder, cipher, now = () => new Date() }: TaskPostingDeps) {
  async function loadPoster(userId: string) {
    const [user] = await db
      .select({ status: users.status, createdAt: users.createdAt, phoneVerifiedAt: users.phoneVerifiedAt, homeMarketId: users.homeMarketId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  }

  async function marketFor(marketId: string) {
    const [market] = await db.select().from(markets).where(eq(markets.id, marketId)).limit(1);
    return market ?? null;
  }

  /** What the wizard needs: the market, its categories, and the posting rules from the policy. */
  async function pageData(userId: string): Promise<PostTaskPageData | null> {
    const poster = await loadPoster(userId);
    if (!poster) return null;
    const market = await marketFor(poster.homeMarketId);
    return market ? pageDataFor(market) : null;
  }

  /**
   * The same for someone not signed in yet (/post, J-V5): the market new accounts start in, open (prelaunch or
   * live). The draft stays on their device until they have an account.
   */
  async function guestPageData(marketSlug: string): Promise<PostTaskPageData | null> {
    const market = await openMarketBySlug(marketSlug);
    const data = market ? await pageDataFor(market) : null;
    return data ? { ...data, guest: true } : null;
  }

  async function openMarketBySlug(marketSlug: string) {
    const [market] = await db.select().from(markets).where(and(eq(markets.slug, String(marketSlug)), inArray(markets.status, ['prelaunch', 'live']))).limit(1);
    return market ?? null;
  }

  async function pageDataFor(market: NonNullable<Awaited<ReturnType<typeof marketFor>>>): Promise<PostTaskPageData | null> {
    const [policy, categoryViews, marketView] = await Promise.all([
      getPublishedPolicy(market.id, db),
      listCategoryViews(market.id, db),
      getMarketView(market, db),
    ]);
    if (!policy) return null;
    const rules: TaskPostingRules = {
      minLeadHours: policy.timers.minLeadHours,
      maxLeadDays: policy.timers.maxLeadDays,
      ...POSTING_LIMITS,
    };
    return { market: marketView, categories: categoryViews, rules, aiDraftingEnabled: false, now: now().toISOString(), templates: templatesForCategories(categoryViews) };
  }

  /**
   * Address search for the "where" step: only the place and its public area, never stored. The whole US is searched
   * (owner, 2026-11-14: national, cities open in turn), places near the market first, and any address can be posted
   * (owner, 2026-11-21: "remove the limit of area totally"). Inside the market's service area helpers see its
   * neighborhood; outside it, its city ("Waco, TX") around its ZIP's center, and `outside` lets the screen say helpers
   * there may be few for now.
   */
  async function searchAddresses(userId: string, query: string): Promise<AddressSuggestion[]> {
    if (query.trim().length < 3) return [];
    const poster = await loadPoster(userId);
    const market = poster ? await marketFor(poster.homeMarketId) : null;
    return market ? searchAddressesNear(market, query) : [];
  }

  /** The address search for someone not signed in yet (/post, J-V5), around the market they draft in. */
  async function guestSearchAddresses(marketSlug: string, query: string): Promise<AddressSuggestion[]> {
    if (query.trim().length < 3) return [];
    const market = await openMarketBySlug(marketSlug);
    return market ? searchAddressesNear(market, query) : [];
  }

  async function searchAddressesNear(market: NonNullable<Awaited<ReturnType<typeof marketFor>>>, query: string): Promise<AddressSuggestion[]> {
    const marketAreas = await db.select().from(areas).where(and(eq(areas.marketId, market.id), neighborhoodsOnly()));
    const places = await geocoder.search(query, { near: { lat: market.centerLat, lng: market.centerLng } });
    return Promise.all(places.map(async (place): Promise<AddressSuggestion> => {
      const line2 = `${place.city}, ${place.state} ${place.zip}`;
      const area = inServiceArea(market, place) ? nearestArea(marketAreas, place) : null;
      if (area) return { placeId: place.placeId, line1: place.line1, line2, areaName: area.name, areaPoint: { lat: area.centerLat, lng: area.centerLng }, inServiceArea: true };
      const point = await zipPoint(place.zip);
      return {
        placeId: place.placeId,
        line1: place.line1,
        line2,
        areaName: cityAreaName(place),
        ...(point ? { areaPoint: point } : {}),
        inServiceArea: false,
        outside: { city: place.city, state: place.state, zip: place.zip },
      };
    }));
  }

  /** A saved address reused by "Post again": the poster's own task's address, while it's still kept. */
  async function savedPlace(userId: string, taskId: string, marketId: string) {
    const [row] = await db
      .select({ addressEnc: taskLocations.addressEnc, area: areas })
      .from(tasks)
      .innerJoin(taskLocations, eq(taskLocations.id, tasks.locationId))
      .innerJoin(areas, eq(areas.id, taskLocations.areaId))
      .where(and(eq(tasks.id, String(taskId)), eq(tasks.posterUserId, userId)))
      .limit(1);
    const address = row ? readExactAddress(cipher, row.addressEnc) : undefined;
    if (!row || !address || row.area.marketId !== marketId) return null;
    return { address, area: row.area };
  }

  /**
   * "Post again" (plan 4.2): one of the poster's own finished tasks as a new draft (`PostTaskRepeat`): everything
   * but photos, the same window on the next date that fits, and the saved address while it's kept.
   */
  async function repeat(userId: string, taskId: string): Promise<PostTaskRepeat | null> {
    const [row] = await db
      .select({ task: tasks, categorySlug: categories.slug })
      .from(tasks)
      .innerJoin(categories, eq(categories.id, tasks.categoryId))
      .where(and(eq(tasks.id, String(taskId)), eq(tasks.posterUserId, userId)))
      .limit(1);
    if (!row || !REPEATABLE.has(row.task.status)) return null;
    // Not a task staff hid or closed: Post again would put it back on the board (sweep 2026-11-20, PT13).
    if (row.task.hiddenAt) return null;
    const [closedByStaff] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.targetId, row.task.id), eq(auditLog.action, 'task.close'))).limit(1);
    if (closedByStaff) return null;
    const data = await pageData(userId);
    if (!data || !data.categories.some((category) => category.slug === row.categorySlug)) return null;
    const { task } = row;

    let location: TaskDraftInput['location'] = { mode: 'remote' };
    let address: AddressSuggestion | undefined;
    if (task.mode === 'local') {
      const saved = await savedPlace(userId, task.id, task.marketId);
      if (saved) {
        const placeId = `${REPEAT_PLACE_PREFIX}${task.id}`;
        location = {
          mode: 'local',
          placeId,
          ...(saved.address.line2 ? { unit: saved.address.line2 } : {}),
          ...(saved.address.accessNotes ? { accessNotes: saved.address.accessNotes } : {}),
        };
        // A saved address outside the market reads as it did when it was posted: its city.
        const outside = isCityAreaSlug(saved.area.slug);
        address = {
          placeId,
          line1: saved.address.line1,
          line2: `${saved.address.city}, ${saved.address.state} ${saved.address.zip}`,
          areaName: saved.area.name,
          areaPoint: { lat: saved.area.centerLat, lng: saved.area.centerLng },
          inServiceArea: !outside,
          ...(outside ? { outside: { city: saved.address.city, state: saved.address.state, zip: saved.address.zip } } : {}),
        };
      } else {
        location = { mode: 'local', placeId: '' };
      }
    }

    const draft: TaskDraftInput = {
      categorySlug: row.categorySlug as CategorySlug,
      title: task.title,
      description: task.description,
      details: task.details,
      photoIds: [],
      location,
      schedule: nextRepeatSchedule(task, data.rules, now(), data.market.timeZone),
      budget:
        task.pricingType === 'hourly'
          ? { type: 'hourly', rateCents: task.hourlyRateCents ?? 0, estimatedHours: task.estimatedHours ?? 0, hoursCap: task.hoursCap ?? 0 }
          : { type: 'fixed', priceCents: task.budgetCents ?? 0 },
      ...(task.expenseAllowanceCents > 0 && task.expenseAllowanceNote
        ? { expenseAllowance: { amountCents: task.expenseAllowanceCents, description: task.expenseAllowanceNote } }
        : {}),
    };
    return { fromTitle: task.title, draft, ...(address ? { address } : {}), ...(task.mode === 'local' && !address ? { addressDeleted: true } : {}) };
  }

  async function post(userId: string, input: unknown, { requestKey }: { requestKey?: string } = {}): Promise<PostTaskOutcome> {
    const at = now();
    const fail = (result: ActionResult): PostTaskOutcome => ({ ok: false, result });

    const poster = await loadPoster(userId);
    if (!poster || !POSTING_STATUSES.has(poster.status)) return fail({ ok: false, code: 'not_allowed' });
    // A verified phone first where texts work (plan 9.2: not without SMS, nor in the grace).
    const phone = await loadPhoneCheck(db, userId);
    if (!phoneGatePasses(phone.check, poster.phoneVerifiedAt !== null)) return fail({ ok: false, code: 'not_allowed' });
    // Risk asked this client to verify their ID first (src/modules/trust/poster-risk.ts).
    if (await posterIdentityRequirement(db, userId, at)) return fail({ ok: false, code: 'identity_required' });
    const data = await pageData(userId);
    const market = await marketFor(poster.homeMarketId);
    if (!data || !market) return fail({ ok: false, code: 'not_allowed' });

    const parsed = createTaskDraftSchema({ ...data, now: at.toISOString() }).safeParse(input);
    if (!parsed.success) return fail(validationFailed(parsed.error));
    const draft = { ...parsed.data, details: compactTaskDetails(parsed.data.details) };

    const [category] = await db.select().from(categories).where(eq(categories.slug, draft.categorySlug)).limit(1);
    if (!category) return fail(fieldError('categorySlug', 'not_supported'));

    // A title is public everywhere it goes (boards, the page's <title> and address, alerts), and unlike the description
    // it isn't masked where it's shown: contact details stay out of it (sweep 2026-11-20, PT8).
    if (maskContactDetails(draft.title).masked) return fail(fieldError('title', 'contact_details'));

    const text = [draft.title, draft.description, ...Object.values(draft.details).map(String)].join(' ');
    if (findProhibitedPhrase(text, [...GLOBAL_PROHIBITED_PHRASES, ...category.prohibitedKeywords])) {
      return fail(fieldError('description', 'prohibited'));
    }

    if (at.getTime() - poster.createdAt.getTime() < NEW_ACCOUNT.days * 86_400_000) {
      const [open] = await db
        .select({ value: count() })
        .from(tasks)
        // Still open: a task whose window has ended stays `open` in the table (it reads as expired), and counting it
        // kept a new client from posting again for the rest of the week (sweep 2026-11-20).
        // A team job's partner part (2026-11-24) isn't a task the client posted.
        .where(and(eq(tasks.posterUserId, userId), eq(tasks.status, 'open'), isNull(tasks.teamPartOf), gt(tasks.windowEnd, at)));
      if ((open?.value ?? 0) >= NEW_ACCOUNT.maxOpenTasks) return fail({ ok: false, code: 'limit_reached' });
    }

    // Where: resolve and check the address (the provider confirms it again); store it encrypted and keep only
    // the area public. The provider's coordinates only pick the area: they're never stored.
    let location: { addressEnc: string; zip: string; areaId: string; areaSlug: string; center: { lat: number; lng: number } } | null = null;
    if (draft.location.mode === 'local' && draft.location.placeId.startsWith(REPEAT_PLACE_PREFIX)) {
      // "Post again": the poster's own saved address, read again now (gone once the retention timer deleted it).
      const saved = await savedPlace(userId, draft.location.placeId.slice(REPEAT_PLACE_PREFIX.length), market.id);
      if (!saved) return fail(fieldError('location.placeId', 'invalid'));
      location = {
        addressEnc: cipher.encrypt(
          JSON.stringify({
            line1: saved.address.line1,
            ...(draft.location.unit ? { line2: draft.location.unit } : {}),
            city: saved.address.city,
            state: saved.address.state,
            zip: saved.address.zip,
            ...(draft.location.accessNotes ? { accessNotes: draft.location.accessNotes } : {}),
          }),
        ),
        zip: saved.address.zip,
        areaId: saved.area.id,
        areaSlug: saved.area.slug,
        center: { lat: saved.area.centerLat, lng: saved.area.centerLng },
      };
    } else if (draft.location.mode === 'local') {
      let place: GeoPlace | null;
      try {
        place = await geocoder.resolve(draft.location.placeId);
      } catch (error) {
        if (!(error instanceof GeocoderUnavailableError)) throw error;
        console.error('[geocoding]', error.message);
        return fail({ ok: false, code: 'unknown' });
      }
      if (!place) return fail(fieldError('location.placeId', 'invalid'));
      const marketAreas = await db.select().from(areas).where(and(eq(areas.marketId, market.id), neighborhoodsOnly()));
      const neighborhood = inServiceArea(market, place) ? nearestArea(marketAreas, place) : null;
      // Outside the service area (owner, 2026-11-21: post anywhere): the city's area, and the ZIP's center for the
      // public point (US Census data: the provider's coordinates are never kept). `not_supported` only when the ZIP
      // can't be placed at all.
      let area = neighborhood;
      let center = neighborhood ? { lat: neighborhood.centerLat, lng: neighborhood.centerLng } : null;
      if (!neighborhood) {
        center = await zipPoint(place.zip);
        if (!center) return fail(fieldError('location.placeId', 'not_supported'));
        area = await ensureCityArea(db, market.id, place, center);
      }
      if (!area || !center) return fail(fieldError('location.placeId', 'not_supported'));
      location = {
        addressEnc: cipher.encrypt(
          JSON.stringify({
            line1: place.line1,
            ...(draft.location.unit ? { line2: draft.location.unit } : {}),
            city: place.city,
            state: place.state,
            zip: place.zip,
            ...(draft.location.accessNotes ? { accessNotes: draft.location.accessNotes } : {}),
          }),
        ),
        zip: place.zip,
        areaId: area.id,
        areaSlug: area.slug,
        center,
      };
    }

    // Photos must be the poster's own uploads.
    const photoIds = [...new Set(draft.photoIds)];
    if (photoIds.length > 0) {
      const owned = await db
        .select({ id: files.id })
        .from(files)
        .where(and(inArray(files.id, photoIds), eq(files.ownerUserId, userId), eq(files.kind, 'task_photo')));
      if (owned.length !== photoIds.length) return fail(fieldError('photoIds', 'invalid'));
    }

    // When: the market's local window → UTC. A flexible day spans the whole day, from the earliest start the lead
    // time allows when that's later (a flexible day today): offers expire at the window's start (blueprint 03), so a
    // window that began at midnight took only dead offers (sweep 2026-11-20).
    const { date, flexible, startTime, endTime } = draft.schedule;
    const dayStart = new Date(marketLocalToUtc(date, flexible ? '00:00' : startTime!, data.market.timeZone));
    const earliest = new Date(Math.ceil((at.getTime() + data.rules.minLeadHours * 3_600_000) / HALF_HOUR_MS) * HALF_HOUR_MS);
    const windowStart = flexible && dayStart < earliest ? earliest : dayStart;
    const windowEnd = new Date(marketLocalToUtc(date, flexible ? '23:59' : endTime!, data.market.timeZone));

    const taskId = newId('tsk');
    const slugBase = `${slugPart(draft.title) || 'task'}-${location?.areaSlug ?? 'remote'}`;
    const point = location ? fuzzedPublicPoint(location.center, taskId) : null;

    // The slug ends in 4 random characters, which can meet a task's of the same title in the same area ("Post again",
    // regular visits): the insert then fails on the unique slug, so it tries another (sweep 2026-11-20).
    let slug = '';
    for (let attempt = 0; ; attempt += 1) {
      slug = `${slugBase}-${randomBytes(3).toString('hex').slice(0, 4)}`;
      try {
        await db.transaction(async (tx) => {
          let locationId: string | null = null;
          if (location) {
            locationId = newId('loc');
            await tx.insert(taskLocations).values({
              id: locationId,
              ownerUserId: userId,
              addressEnc: location.addressEnc,
              zip: location.zip,
              areaId: location.areaId,
              createdAt: at,
            });
          }
          await tx.insert(tasks).values({
            id: taskId,
            slug,
            posterUserId: userId,
            marketId: market.id,
            categoryId: category.id,
            title: draft.title,
            description: draft.description,
            details: draft.details,
            mode: draft.location.mode,
            status: 'open',
            pricingType: draft.budget.type,
            budgetCents: draft.budget.type === 'fixed' ? draft.budget.priceCents : null,
            hourlyRateCents: draft.budget.type === 'hourly' ? draft.budget.rateCents : null,
            estimatedHours: draft.budget.type === 'hourly' ? draft.budget.estimatedHours : null,
            hoursCap: draft.budget.type === 'hourly' ? draft.budget.hoursCap : null,
            expenseAllowanceCents: draft.expenseAllowance?.amountCents ?? 0,
            expenseAllowanceNote: draft.expenseAllowance?.description ?? null,
            windowStart,
            windowEnd,
            flexible,
            locationId,
            publicAreaId: location?.areaId ?? null,
            publicLat: point?.lat ?? null,
            publicLng: point?.lng ?? null,
            publishedAt: at,
            expiresAt: windowEnd,
            requestKey: requestKey ?? null,
            createdAt: at,
            updatedAt: at,
          });
          if (photoIds.length > 0) {
            await tx.insert(taskPhotos).values(photoIds.map((fileId, position) => ({ taskId, fileId, position })));
          }
          await tx.insert(outboxEvents).values({
            id: newId('evt'),
            type: 'task.posted',
            aggregateType: 'task',
            aggregateId: taskId,
            payload: { taskId, marketId: market.id, categorySlug: category.slug },
          });
          await tx.insert(auditLog).values({
            id: newId('aud'),
            actorId: userId,
            actorRole: 'user',
            action: 'task.posted',
            targetType: 'task',
            targetId: taskId,
          });
        });
        break;
      } catch (error) {
        // The same post at the same moment (its key is taken): the task the other request made (bad connections, J-N1).
        if (requestKey && violatedConstraint(error) === 'tasks_poster_request_key_idx') {
          const [first] = await db.select({ id: tasks.id, slug: tasks.slug }).from(tasks).where(and(eq(tasks.posterUserId, userId), eq(tasks.requestKey, requestKey))).limit(1);
          if (first) return { ok: true, taskId: first.id, slug: first.slug };
        }
        if (!isUniqueViolation(error) || attempt >= 2) throw error;
      }
    }
    return { ok: true, taskId, slug };
  }

  return { pageData, guestPageData, searchAddresses, guestSearchAddresses, post, repeat };
}

export type TaskPosting = ReturnType<typeof createTaskPosting>;
