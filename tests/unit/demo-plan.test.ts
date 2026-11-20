/**
 * The demo marketplace (db/seeds/demo) follows the app's rules in every market: what clients post fits their home
 * and the category's fields and wording rules; only helpers who could really offer do (same market, the offer rules,
 * the onboarding rules, the area); bookings, money and reviews are what the app itself would have written.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_DETAIL_FIELDS,
  createTaskDraftSchema,
  EVIDENCE_CHECKLISTS,
  helperProfileInputSchema,
  SERVICE_RADIUS_MILES,
  type CategorySlug,
  type CategoryView,
  type TaskPostingRules,
} from '@/contracts';
import { offerBlockedReason, offerRulesFor } from '@/modules/offers/helper-domain';
import { computeOnboarding } from '@/modules/verification/progress';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { finalBreakdown, quoteBreakdown } from '@/modules/payments/fees';
import { marketClockTime, marketDayKey } from '@/shared/format';
import { CATEGORIES } from '../../db/seeds/data/austin';
import { GAINESVILLE, GAINESVILLE_AREAS, gainesvilleAreaId } from '../../db/seeds/data/gainesville';
import { DEMO_MARKETS, demoAreaId, demoMarketId } from '../../db/seeds/demo/markets';
import { buildDemoPlan, defaultDemoPolicies, DEMO_PREFIX, DEMO_TIME_ZONE, REVIEW_TAGS, type DemoPlan } from '../../db/seeds/demo/plan';

const DAYTIME = new Date('2026-11-14T18:10:00.000Z'); // 13:10 in Gainesville, 12:10 in the Central-time markets
const NIGHT = new Date('2026-11-15T07:40:00.000Z'); // 02:40 in Gainesville, 01:40 in Central time
/** Each market's clock: the hand-written cast in Gainesville (Eastern), the generated markets in Central time. */
const zoneOf = (marketId: string) => (marketId === GAINESVILLE.id ? GAINESVILLE.timeZone : DEMO_TIME_ZONE);
const KM_PER_MILE = 1.609344;
const POLICIES = defaultDemoPolicies();
const categoryBySlug = new Map(CATEGORIES.map((category) => [category.slug as CategorySlug, category]));
const categoryById = new Map(CATEGORIES.map((category) => [category.id, category]));
/** Every demo neighborhood: its center and its market. */
const areaById = new Map<string, { lat: number; lng: number; marketId: string }>([
  ...GAINESVILLE_AREAS.map((area) => [gainesvilleAreaId(area.slug), { lat: area.lat, lng: area.lng, marketId: GAINESVILLE.id }] as const),
  ...DEMO_MARKETS.flatMap((market) => market.areas.map((area) => [demoAreaId(market, area), { lat: area.lat, lng: area.lng, marketId: demoMarketId(market) }] as const)),
]);
const POSTING_RULES: TaskPostingRules = { minLeadHours: 3, maxLeadDays: 14, maxPhotos: 8, maxPhotoMegabytes: 10, maxExpenseAllowanceCents: 50_000 };
const CATEGORY_VIEWS: CategoryView[] = CATEGORIES.map((category) => ({
  slug: category.slug as CategorySlug,
  name: category.name,
  inHome: category.inHome,
  remoteAllowed: category.remoteAllowed,
  requiresBackgroundCheck: category.requiresBackgroundCheck,
  defaultPricingType: category.defaultPricingType as 'fixed' | 'hourly',
  minPriceCents: category.minPriceCents,
  ...(category.minHours ? { minHours: category.minHours } : {}),
  priceGuidance: category.guidance,
}));

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const plans: Array<[string, Date, DemoPlan]> = [DAYTIME, NIGHT].map((now) => [now.toISOString(), now, buildDemoPlan({ now, policies: POLICIES })]);

describe.each(plans)('the demo marketplace at %s', (_label, now, plan) => {
  const people = new Map(plan.people.map((person) => [person.id, person]));
  const clients = new Map(plan.clients.map((client) => [client.userId, client]));
  const tasksById = new Map(plan.tasks.map((task) => [task.id, task]));
  const locationById = new Map(plan.locations.map((location) => [location.id, location]));
  const offersByTask = new Map<string, typeof plan.offers>();
  for (const offer of plan.offers) offersByTask.set(offer.taskId, [...(offersByTask.get(offer.taskId) ?? []), offer]);

  it('is busy everywhere: about 1,200 tasks, every market and neighborhood, and plenty in Pretty Prairie', () => {
    const open = plan.tasks.filter((task) => task.status === 'open');
    expect(plan.tasks.length).toBe(216 + 1000);
    expect(open.length).toBeGreaterThanOrEqual(400);
    expect(plan.bookings.filter((booking) => booking.status === 'completed').length).toBeGreaterThanOrEqual(300);
    for (const category of CATEGORIES) expect(open.some((task) => task.categoryId === category.id)).toBe(true);
    for (const [areaId] of areaById) expect(plan.tasks.some((task) => task.publicAreaId === areaId), areaId).toBe(true);
    for (const market of DEMO_MARKETS) {
      const marketTasks = plan.tasks.filter((task) => task.marketId === demoMarketId(market));
      expect(marketTasks.length).toBe(market.taskCount);
      expect(marketTasks.filter((task) => task.status === 'open').length, market.slug).toBeGreaterThanOrEqual(Math.floor(market.taskCount / 5));
      expect(plan.bookings.some((booking) => booking.marketId === demoMarketId(market) && booking.status === 'completed'), market.slug).toBe(true);
    }
    const prairie = DEMO_MARKETS.find((market) => market.slug === 'pretty-prairie')!;
    expect(plan.tasks.filter((task) => task.publicAreaId === demoAreaId(prairie, prairie.areas[0]!)).length).toBeGreaterThanOrEqual(45);
  });

  it('has at least three tasks for every client and every helper, on average', () => {
    const helpers = plan.people.filter((person) => person.helper).length;
    const posters = plan.people.length - helpers;
    expect(plan.tasks.length / posters).toBeGreaterThanOrEqual(3);
    expect(plan.tasks.length / helpers).toBeGreaterThanOrEqual(3);
    for (const client of plan.clients.filter((c) => c.marketId !== GAINESVILLE.id)) expect(plan.tasks.some((task) => task.posterUserId === client.userId), client.userId).toBe(true);
  });

  it('comes out the same on every run, with demo ids only', () => {
    const again = buildDemoPlan({ now, policies: POLICIES });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    const ids = [...plan.people, ...plan.tasks, ...plan.offers, ...plan.bookings, ...plan.locations, ...plan.availability].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toContain(DEMO_PREFIX);
    expect(new Set(plan.tasks.map((task) => task.slug)).size).toBe(plan.tasks.length);
  });

  it('only has fictional contact details, and a unique handle for every helper', () => {
    const handles = plan.people.flatMap((person) => (person.helper ? [person.helper.handle] : []));
    expect(new Set(handles).size).toBe(handles.length);
    for (const handle of ['jordan-t', 'sam-k', 'lee-m', 'priya-s']) expect(handles).not.toContain(handle);
    expect(new Set(plan.people.map((person) => person.email)).size).toBe(plan.people.length);
    expect(new Set(plan.people.map((person) => person.phone)).size).toBe(plan.people.length);
    for (const person of plan.people) {
      expect(person.email).toMatch(/^[a-z0-9.-]+\.demo@example\.test$/);
      // The 555 exchange: never texted (src/integrations/sms).
      expect(person.phone).toMatch(/^\+1\d{3}555\d{4}$/);
      expect(person.homeMarketId).toBeDefined();
    }
  });

  it('gives every helper a complete profile the app accepts, in their own market, with what bookable needs', () => {
    for (const person of plan.people.filter((p) => p.helper)) {
      const helper = person.helper!;
      expect(areaById.get(helper.areaId)?.marketId).toBe(person.homeMarketId);
      const parsed = helperProfileInputSchema.pick({ headline: true, bio: true, languages: true }).safeParse({ headline: helper.headline, bio: helper.bio, languages: helper.languages });
      expect(parsed.success, `${person.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(SERVICE_RADIUS_MILES).toContain(Math.round(helper.serviceRadiusKm! / KM_PER_MILE));
      const services = helper.services.map((service) => categoryById.get(service.categoryId)!);
      expect(new Set(services.map((category) => category.id)).size).toBe(services.length);
      const onboarding = computeOnboarding({
        profileComplete: true,
        agreementAccepted: true,
        services: services.map((category) => ({ categorySlug: category.slug as CategorySlug, requiresBackgroundCheck: category.requiresBackgroundCheck })),
        areaSet: true,
        phoneVerified: true,
        identity: { status: 'verified', cleared: true },
        address: { status: 'verified', verified: true },
        payout: 'active',
        background: { status: helper.backgroundCheckedAt ? 'clear' : 'not_started', eligible: Boolean(helper.backgroundCheckedAt) },
      });
      expect(onboarding.progress.bookable).toBe(true);
      // Verified one step after another, after joining.
      expect(Date.parse(helper.idVerifiedAt!)).toBeGreaterThan(Date.parse(person.createdAt));
      expect(Date.parse(helper.homeAddress!.verifiedAt)).toBeGreaterThan(Date.parse(helper.idVerifiedAt!));
      if (helper.backgroundCheckedAt) expect(Date.parse(helper.backgroundCheckedAt)).toBeGreaterThan(Date.parse(helper.payoutsReadyAt!));
      for (const service of helper.services) {
        const category = categoryById.get(service.categoryId)!;
        expect(service.pricingType).toBe(category.defaultPricingType);
        expect(service.fromPriceCents ?? service.hourlyRateCents ?? 0).toBeGreaterThanOrEqual(category.slug === 'moving-help' ? 3000 : category.minPriceCents);
      }
    }
    // Every category has at least two helpers in every generated market (beyond the cast's Gainesville).
    for (const market of DEMO_MARKETS) {
      for (const category of CATEGORIES) {
        const offering = plan.people.filter((p) => p.homeMarketId === demoMarketId(market) && p.helper?.services.some((service) => service.categoryId === category.id));
        expect(offering.length, `${market.slug} ${category.slug}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has clients post what fits their home, in their own neighborhood, by the category’s rules', () => {
    for (const task of plan.tasks) {
      const category = categoryById.get(task.categoryId)!;
      const client = clients.get(task.posterUserId)!;
      const poster = people.get(task.posterUserId)!;
      expect(poster.mode).toBe('poster');
      expect(poster.homeMarketId).toBe(task.marketId);
      const words = `${task.title} ${task.description} ${Object.values(task.details).join(' ')}`.toLowerCase();
      for (const keyword of category.prohibitedKeywords) expect(words, task.id).not.toContain(keyword);
      expect(words).not.toMatch(/https?:|www\.|@|\d{3}[-. ]\d{3}[-. ]\d{4}/);
      // The category's fields, with allowed values.
      for (const field of CATEGORY_DETAIL_FIELDS[category.slug as CategorySlug]) {
        const value = task.details[field.key];
        if (value === undefined) {
          expect(field.required).toBe(false);
          continue;
        }
        if (field.kind === 'choice') expect(field.options).toContain(value);
        if (field.kind === 'count') {
          expect(value as number).toBeGreaterThanOrEqual(field.min);
          expect(value as number).toBeLessThanOrEqual(field.max);
        }
        if (field.kind === 'yes_no') expect(typeof value).toBe('boolean');
        if (field.kind === 'text') expect(String(value).length).toBeLessThanOrEqual(field.maxLength);
      }
      for (const key of Object.keys(task.details)) expect(CATEGORY_DETAIL_FIELDS[category.slug as CategorySlug].map((field) => field.key)).toContain(key);
      // The posting form's own checks, as of when it was posted (fields, prices, the 3-hour to 14-day lead).
      const flexible = task.flexible;
      const draft = {
        categorySlug: category.slug,
        title: task.title,
        description: task.description,
        details: task.details,
        photoIds: [],
        location: task.mode === 'remote' ? { mode: 'remote' as const } : { mode: 'local' as const, placeId: 'plc_demo' },
        schedule: { date: marketDayKey(task.windowStart, zoneOf(task.marketId)), flexible, ...(flexible ? {} : { startTime: marketClockTime(task.windowStart, zoneOf(task.marketId)), endTime: marketClockTime(task.windowEnd, zoneOf(task.marketId)) }) },
        budget: task.pricingType === 'fixed'
          ? { type: 'fixed' as const, priceCents: task.budgetCents! }
          : { type: 'hourly' as const, rateCents: task.hourlyRateCents!, estimatedHours: task.estimatedHours!, hoursCap: task.hoursCap! },
      };
      const parsed = createTaskDraftSchema({ rules: POSTING_RULES, categories: CATEGORY_VIEWS, now: task.publishedAt.toISOString(), market: { timeZone: zoneOf(task.marketId) } }).safeParse(draft);
      expect(parsed.success, `${task.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      // Where: the poster's own address and neighborhood, shown only as a point near the neighborhood's center.
      if (task.mode === 'remote') {
        expect(category.remoteAllowed).toBe(true);
        expect(task.locationId).toBeNull();
      } else {
        const location = locationById.get(task.locationId!)!;
        expect(location.ownerUserId).toBe(task.posterUserId);
        expect(task.publicAreaId).toBe(location.areaId);
        expect(client.areaId).toBe(location.areaId);
        const center = areaById.get(location.areaId)!;
        expect(center.marketId).toBe(task.marketId);
        expect(milesBetween(center, { lat: task.publicLat!, lng: task.publicLng! })).toBeLessThan(0.25);
      }
      if (category.slug === 'yard-cleanup') expect(client.home).toBe('house');
      if (task.details.floor !== undefined) expect(client.home).toBe('apartment');
      expect(task.windowEnd.getTime()).toBeGreaterThan(task.windowStart.getTime());
      expect(task.publishedAt.getTime()).toBeLessThan(now.getTime());
      expect(Date.parse(poster.createdAt)).toBeLessThan(task.publishedAt.getTime());
      if (task.status === 'open') expect(task.windowEnd.getTime()).toBeGreaterThan(now.getTime());
      if (task.status === 'expired' || task.status === 'completed') expect(task.windowEnd.getTime()).toBeLessThan(now.getTime());
    }
    // Nobody has more than three tasks open at once.
    const open = new Map<string, number>();
    for (const task of plan.tasks.filter((t) => t.status === 'open')) open.set(task.posterUserId, (open.get(task.posterUserId) ?? 0) + 1);
    for (const count of open.values()) expect(count).toBeLessThanOrEqual(3);
  });

  it('only has offers the app would accept, from helpers in the market who cover the task', () => {
    const pendingByTask = new Map<string, number>();
    const pairs = new Set<string>();
    for (const offer of plan.offers) {
      const task = tasksById.get(offer.taskId)!;
      const category = categoryById.get(task.categoryId)!;
      const helperPerson = people.get(offer.helperUserId)!;
      const helper = helperPerson.helper!;
      expect(helperPerson.homeMarketId, offer.id).toBe(task.marketId);
      const area = areaById.get(helper.areaId)!;
      const offered = helper.services.map((service) => categoryById.get(service.categoryId)!.slug as CategorySlug);
      const bookable = offered.filter((slug) => !categoryBySlug.get(slug)!.requiresBackgroundCheck || helper.backgroundCheckedAt);
      // At the time it was made, on the task as it was then (open).
      const blocked = offerBlockedReason(
        { userId: offer.helperUserId, bookableCategories: bookable, offeredCategories: offered, suspended: false, serviceRadiusMiles: Math.round(helper.serviceRadiusKm! / KM_PER_MILE) },
        { posterUserId: task.posterUserId, status: 'open', windowStart: task.windowStart, windowEnd: task.windowEnd, categorySlug: category.slug as CategorySlug, requiresBackgroundCheck: category.requiresBackgroundCheck, remote: task.mode === 'remote', distanceMiles: task.mode === 'remote' ? null : milesBetween({ lat: area.lat, lng: area.lng }, { lat: task.publicLat!, lng: task.publicLng! }) },
        offer.createdAt,
      );
      expect(blocked, `${offer.id}`).toBeUndefined();
      const ready = Math.max(Date.parse(helper.payoutsReadyAt!), Date.parse(helper.homeAddress!.verifiedAt), helper.backgroundCheckedAt ? Date.parse(helper.backgroundCheckedAt) : 0);
      expect(offer.createdAt.getTime()).toBeGreaterThan(ready);
      expect(offer.createdAt.getTime()).toBeGreaterThan(task.publishedAt.getTime());
      expect(offer.updatedAt.getTime()).toBeGreaterThanOrEqual(offer.createdAt.getTime());
      expect(offer.createdAt.getTime()).toBeLessThan(now.getTime());
      // The offer form's rules: a start time it offers, a price at or above the minimum, hours at least the estimate.
      const rules = offerRulesFor(task, { minPriceCents: category.minPriceCents }, zoneOf(task.marketId));
      expect(marketDayKey(offer.proposedStart, zoneOf(task.marketId))).toBe(rules.date);
      expect(rules.startTimes).toContain(marketClockTime(offer.proposedStart, zoneOf(task.marketId)));
      expect(offer.pricingType).toBe(task.pricingType);
      if (offer.pricingType === 'fixed') expect(offer.priceCents!).toBeGreaterThanOrEqual(rules.minPriceCents);
      else expect(offer.hoursCap!).toBeGreaterThanOrEqual(rules.minHoursCap ?? 0);
      expect(offer.message.length).toBeLessThanOrEqual(500);
      expect(offer.brings.every((tool) => helper.tools.includes(tool))).toBe(true);
      expect(offer.expiresAt.getTime()).toBe(Math.min(task.windowStart.getTime(), offer.createdAt.getTime() + 72 * 3_600_000));
      if (offer.status === 'pending') {
        expect(task.status).toBe('open');
        expect(offer.expiresAt.getTime()).toBeGreaterThan(now.getTime());
        pendingByTask.set(task.id, (pendingByTask.get(task.id) ?? 0) + 1);
      }
      if (offer.status === 'expired') expect(offer.expiresAt.getTime()).toBeLessThanOrEqual(now.getTime());
      const pair = `${offer.taskId}:${offer.helperUserId}`;
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
    }
    for (const task of plan.tasks) expect(task.offerCount).toBe(pendingByTask.get(task.id) ?? 0);
  });

  it('books one helper per task, at a time they are free, with the market’s money', () => {
    const busy = new Map<string, Array<[number, number]>>();
    for (const booking of plan.bookings) {
      const task = tasksById.get(booking.taskId)!;
      const taskOffers = offersByTask.get(task.id) ?? [];
      const accepted = taskOffers.filter((offer) => offer.status === 'accepted');
      expect(accepted.map((offer) => offer.id)).toEqual([booking.offerId]);
      expect(taskOffers.filter((offer) => offer.id !== booking.offerId).every((offer) => offer.status === 'declined')).toBe(true);
      const offer = accepted[0]!;
      expect(booking.helperUserId).toBe(offer.helperUserId);
      expect(booking.posterUserId).toBe(task.posterUserId);
      expect(booking.marketId).toBe(task.marketId);
      expect(booking.policyVersionId).toBe(POLICIES[task.marketId]!.id);
      expect(task.status).toBe(booking.status === 'completed' ? 'completed' : 'assigned');
      expect(booking.startAt.getTime()).toBe(offer.proposedStart.getTime());
      // In order: offers, booked, started, sent, approved; all before now.
      expect(booking.confirmedAt.getTime()).toBeGreaterThan(Math.max(...taskOffers.map((o) => o.createdAt.getTime())));
      expect(booking.confirmedAt.getTime()).toBeLessThan(Math.min(booking.startAt.getTime(), now.getTime()));
      if (booking.status === 'confirmed') expect(booking.startAt.getTime()).toBeGreaterThan(now.getTime());
      if (booking.status === 'in_progress') {
        expect(booking.arrivedAt!.getTime()).toBeLessThan(now.getTime());
        const hour = Number(marketClockTime(now, zoneOf(booking.marketId)).slice(0, 2));
        expect(hour >= 9 && hour < 19).toBe(true);
      }
      // Never two bookings at once for a helper.
      const span: [number, number] = [booking.startAt.getTime(), (booking.completionSubmittedAt ?? new Date(booking.startAt.getTime() + 3 * 3_600_000)).getTime()];
      for (const [from, until] of busy.get(booking.helperUserId) ?? []) expect(span[0] < until && span[1] > from, `${booking.id} overlaps`).toBe(false);
      busy.set(booking.helperUserId, [...(busy.get(booking.helperUserId) ?? []), span]);

      const pricing = offer.pricingType === 'fixed'
        ? { type: 'fixed' as const, priceCents: offer.priceCents! }
        : { type: 'hourly' as const, rateCents: offer.hourlyRateCents!, estimatedHours: offer.estimatedHours!, hoursCap: offer.hoursCap! };
      const funded = quoteBreakdown(DEFAULT_FEES, pricing);
      expect(booking.terms.breakdown).toEqual(funded);
      expect(booking.payment.amountCents).toBe(funded.posterTotalCents);
      if (booking.status === 'completed') {
        const completion = booking.completion!;
        const final = finalBreakdown(DEFAULT_FEES, funded, completion.hoursWorked !== null ? { approvedHours: completion.hoursWorked } : {});
        expect(completion.finalBreakdown).toEqual(final);
        expect(booking.earning?.amountCents).toBe(final.helperEarningsCents);
        expect(booking.refund?.amountCents ?? 0).toBe(final.posterRefundCents ?? 0);
        expect(booking.payment.status).toBe(booking.refund ? 'partially_refunded' : 'succeeded');
        if (completion.hoursWorked !== null) expect(completion.hoursWorked).toBeLessThanOrEqual(offer.hoursCap!);
        expect(Object.keys(completion.checklist)).toEqual([...EVIDENCE_CHECKLISTS[categoryById.get(task.categoryId)!.slug as CategorySlug]]);
        expect(booking.arrivedAt!.getTime()).toBeLessThan(completion.submittedAt.getTime());
        expect(completion.submittedAt.getTime()).toBeLessThan(booking.completedAt!.getTime());
        expect(booking.completedAt!.getTime()).toBeLessThan(now.getTime());
        if (booking.completedVia === 'auto') expect(booking.completedAt!.getTime() - completion.submittedAt.getTime()).toBe(72 * 3_600_000);
      } else {
        expect(booking.completion).toBeNull();
        expect(booking.earning).toBeNull();
      }
      for (const message of booking.chat) {
        expect([booking.posterUserId, booking.helperUserId]).toContain(message.senderUserId);
        expect(message.at.getTime()).toBeLessThan(now.getTime());
      }
    }
    // Every completed booking's helper is counted on their profile.
    const completedBy = new Map<string, number>();
    for (const booking of plan.bookings.filter((b) => b.status === 'completed')) completedBy.set(booking.helperUserId, (completedBy.get(booking.helperUserId) ?? 0) + 1);
    for (const stat of plan.helperStats) expect(stat.completedCount).toBe(completedBy.get(stat.userId) ?? 0);
  });

  it('keeps reviews double-blind: published when both are in or 14 days after completion', () => {
    for (const booking of plan.bookings) {
      if (booking.status !== 'completed') expect(booking.reviews).toEqual([]);
      const both = booking.reviews.length === 2;
      for (const review of booking.reviews) {
        const fromClient = review.direction === 'client_to_helper';
        expect(review.authorUserId).toBe(fromClient ? booking.posterUserId : booking.helperUserId);
        expect(review.subjectUserId).toBe(fromClient ? booking.helperUserId : booking.posterUserId);
        expect(review.categoryId).toBe(tasksById.get(booking.taskId)!.categoryId);
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        for (const tag of review.tags) expect(REVIEW_TAGS[review.direction] as readonly string[]).toContain(tag);
        expect(review.createdAt.getTime()).toBeGreaterThan(booking.completedAt!.getTime());
        expect(review.createdAt.getTime()).toBeLessThan(now.getTime());
        const windowPassed = booking.completedAt!.getTime() + 14 * 86_400_000 <= now.getTime();
        expect(review.status).toBe(both || windowPassed ? 'published' : 'submitted');
        if (review.publishedAt) expect(review.publishedAt.getTime()).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it('saves only helpers the client booked, and opens slots helpers are free for', () => {
    const completedPairs = new Set(plan.bookings.filter((b) => b.status === 'completed').map((b) => `${b.posterUserId}:${b.helperUserId}`));
    for (const saved of plan.savedHelpers) expect(completedPairs.has(`${saved.userId}:${saved.helperUserId}`)).toBe(true);
    for (const post of plan.availability) {
      const person = people.get(post.helperUserId)!;
      expect(person.homeMarketId).toBe(post.marketId);
      expect(person.helper!.services.map((service) => service.categoryId)).toContain(post.categoryId);
      expect(post.startAt.getTime()).toBeGreaterThan(now.getTime() + 3 * 3_600_000);
      expect(post.startAt.getTime()).toBeLessThan(now.getTime() + 14 * 86_400_000);
      for (const booking of plan.bookings.filter((b) => b.helperUserId === post.helperUserId)) {
        expect(booking.startAt >= post.startAt && booking.startAt < post.endAt).toBe(false);
      }
    }
  });

  it('books a liked helper again some of the time', () => {
    const pairs = new Map<string, number>();
    for (const booking of plan.bookings) pairs.set(`${booking.posterUserId}:${booking.helperUserId}`, (pairs.get(`${booking.posterUserId}:${booking.helperUserId}`) ?? 0) + 1);
    expect([...pairs.values()].some((count) => count > 1)).toBe(true);
  });
});
