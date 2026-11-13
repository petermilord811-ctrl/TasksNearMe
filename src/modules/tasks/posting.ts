import { randomBytes } from 'node:crypto';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { ActionResult, AddressSuggestion, PostTaskPageData, TaskPostingRules } from '@/contracts';
import { compactTaskDetails, createTaskDraftSchema } from '@/contracts';
import { GeocoderUnavailableError, type GeoPlace, type Geocoder } from '@/integrations/geocoding';
import { fieldError, validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { FieldCipher } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketLocalToUtc } from '@/shared/format';
import { users } from '../accounts/schema';
import { fuzzedPublicPoint, inServiceArea, nearestArea } from '../markets/geo';
import { getMarketView, getPublishedPolicy, listCategoryViews } from '../markets/queries';
import { areas, categories, markets } from '../markets/schema';
import { findProhibitedPhrase } from '../trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '../trust/prohibited';
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
    if (!market) return null;
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
    return { market: marketView, categories: categoryViews, rules, aiDraftingEnabled: false, now: now().toISOString() };
  }

  /**
   * Address search for the "where" step: only the place and its public area, never stored. Places near the
   * market come first, and nothing beyond twice its radius (closer ones outside it offer the waitlist).
   */
  async function searchAddresses(userId: string, query: string): Promise<AddressSuggestion[]> {
    if (query.trim().length < 3) return [];
    const poster = await loadPoster(userId);
    const market = poster ? await marketFor(poster.homeMarketId) : null;
    if (!market) return [];
    const marketAreas = await db.select().from(areas).where(eq(areas.marketId, market.id));
    const places = await geocoder.search(query, { near: { lat: market.centerLat, lng: market.centerLng }, withinKm: market.serviceRadiusKm * 2 });
    return places.map((place) => {
      const inside = inServiceArea(market, place);
      const area = inside ? nearestArea(marketAreas, place) : null;
      return {
        placeId: place.placeId,
        line1: place.line1,
        line2: `${place.city}, ${place.state} ${place.zip}`,
        ...(area ? { areaName: area.name, areaPoint: { lat: area.centerLat, lng: area.centerLng } } : {}),
        inServiceArea: inside && area !== null,
      };
    });
  }

  async function post(userId: string, input: unknown): Promise<PostTaskOutcome> {
    const at = now();
    const fail = (result: ActionResult): PostTaskOutcome => ({ ok: false, result });

    const poster = await loadPoster(userId);
    if (!poster || !POSTING_STATUSES.has(poster.status) || !poster.phoneVerifiedAt) return fail({ ok: false, code: 'not_allowed' });
    const data = await pageData(userId);
    const market = await marketFor(poster.homeMarketId);
    if (!data || !market) return fail({ ok: false, code: 'not_allowed' });

    const parsed = createTaskDraftSchema({ ...data, now: at.toISOString() }).safeParse(input);
    if (!parsed.success) return fail(validationFailed(parsed.error));
    const draft = { ...parsed.data, details: compactTaskDetails(parsed.data.details) };

    const [category] = await db.select().from(categories).where(eq(categories.slug, draft.categorySlug)).limit(1);
    if (!category) return fail(fieldError('categorySlug', 'not_supported'));

    const text = [draft.title, draft.description, ...Object.values(draft.details).map(String)].join(' ');
    if (findProhibitedPhrase(text, [...GLOBAL_PROHIBITED_PHRASES, ...category.prohibitedKeywords])) {
      return fail(fieldError('description', 'prohibited'));
    }

    if (at.getTime() - poster.createdAt.getTime() < NEW_ACCOUNT.days * 86_400_000) {
      const [open] = await db
        .select({ value: count() })
        .from(tasks)
        .where(and(eq(tasks.posterUserId, userId), eq(tasks.status, 'open')));
      if ((open?.value ?? 0) >= NEW_ACCOUNT.maxOpenTasks) return fail({ ok: false, code: 'limit_reached' });
    }

    // Where: resolve and check the address (the provider confirms it again); store it encrypted and keep only
    // the area public. The provider's coordinates only pick the area: they're never stored.
    let location: { addressEnc: string; zip: string; areaId: string; areaSlug: string; center: { lat: number; lng: number } } | null = null;
    if (draft.location.mode === 'local') {
      let place: GeoPlace | null;
      try {
        place = await geocoder.resolve(draft.location.placeId);
      } catch (error) {
        if (!(error instanceof GeocoderUnavailableError)) throw error;
        console.error('[geocoding]', error.message);
        return fail({ ok: false, code: 'unknown' });
      }
      if (!place) return fail(fieldError('location.placeId', 'invalid'));
      const marketAreas = await db.select().from(areas).where(eq(areas.marketId, market.id));
      const area = inServiceArea(market, place) ? nearestArea(marketAreas, place) : null;
      if (!area) return fail(fieldError('location.placeId', 'not_supported'));
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
        center: { lat: area.centerLat, lng: area.centerLng },
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

    // When: market-local window → UTC. A flexible day spans the whole day.
    const { date, flexible, startTime, endTime } = draft.schedule;
    const windowStart = new Date(marketLocalToUtc(date, flexible ? '00:00' : startTime!));
    const windowEnd = new Date(marketLocalToUtc(date, flexible ? '23:59' : endTime!));

    const taskId = newId('tsk');
    const slug = `${slugPart(draft.title) || 'task'}-${location?.areaSlug ?? 'remote'}-${randomBytes(3).toString('hex').slice(0, 4)}`;
    const point = location ? fuzzedPublicPoint(location.center, taskId) : null;

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
    return { ok: true, taskId, slug };
  }

  return { pageData, searchAddresses, post };
}

export type TaskPosting = ReturnType<typeof createTaskPosting>;
