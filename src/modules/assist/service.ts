import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { OfferMessageDraftInput, OfferMessageDraftResult, ProfileDraftInput, ProfileDraftResult } from '@/contracts';
import { CATEGORY_SLUGS, type CategorySlug } from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { OfferMessageWriter } from '@/integrations/ai/offer-writer';
import type { ProfileWriter } from '@/integrations/ai/profile-writer';
import { users } from '@/modules/accounts/schema';
import { areas, categories } from '@/modules/markets/schema';
import { getHelperTaskView } from '@/modules/offers/helper';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { aiDraftingFlag } from './availability';
import { formatDate, formatTime, marketLocalToUtc } from '@/shared/format';

/**
 * Writing help for helpers (src/contracts: ProfileDraftInput, OfferMessageDraftInput): the facts come from
 * the database, never from the browser, and the drafts save nothing. Each draft checks the `ai_drafting`
 * flag of the person's home market, a per-person hourly limit, and prohibited phrases in what they typed;
 * contact details are masked in what comes back. A refusal from Claude reads as `prohibited`.
 */

const PROFILE_RULE = { limit: 10, windowSeconds: 60 * 60 };
const OFFER_RULE = { limit: 20, windowSeconds: 60 * 60 };
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

type Failure = { ok: false; code: 'unavailable' | 'rate_limited' | 'prohibited' };

function failureFrom(error: unknown, label: string): Failure {
  if (error instanceof AiRefusedError) return { ok: false, code: 'prohibited' };
  if (!(error instanceof AiUnavailableError)) console.error(`[${label}]`, error);
  return { ok: false, code: 'unavailable' };
}

const clean = (text: string) => maskContactDetails(text).text;

export async function draftHelperProfile(
  { db, writer, now }: { db: Db; writer: ProfileWriter | null; now: Date },
  userId: string,
  input: ProfileDraftInput,
): Promise<ProfileDraftResult> {
  if (!writer || !(await aiDraftingFlag(db, userId))) return { ok: false, code: 'unavailable' };
  const notes = String(input?.notes ?? '').trim().slice(0, 600);
  if (findProhibitedPhrase(notes, GLOBAL_PROHIBITED_PHRASES)) return { ok: false, code: 'prohibited' };

  const [person] = await db
    .select({ firstName: users.firstName, profile: helperProfiles })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!person) return { ok: false, code: 'unavailable' };

  const limited = await consumeRateLimit(db, `assist:profile:${userId}`, PROFILE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  const [services, [area]] = await Promise.all([
    db
      .select({ slug: categories.slug, description: helperServices.description })
      .from(helperServices)
      .innerJoin(categories, eq(categories.id, helperServices.categoryId))
      .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active'))),
    person.profile?.areaId ? db.select({ name: areas.name }).from(areas).where(eq(areas.id, person.profile.areaId)).limit(1) : Promise.resolve([]),
  ]);
  const profile = person.profile;
  try {
    const draft = await writer.draft({
      firstName: person.firstName || 'there',
      services: services
        .filter((service): service is { slug: CategorySlug; description: string } => (CATEGORY_SLUGS as readonly string[]).includes(service.slug))
        .map(({ slug, description }) => ({ categorySlug: slug, ...(description ? { description: clean(description) } : {}) })),
      ...(area ? { areaName: area.name } : {}),
      tools: profile?.tools ?? [],
      languages: (profile?.languages ?? ['en']).map((code) => languageNames.of(code) ?? code),
      notes: clean(notes),
      ...(profile && (profile.headline || profile.bio) ? { current: { headline: clean(profile.headline), bio: clean(profile.bio) } } : {}),
    });
    return { ok: true, draft: { headline: clean(draft.headline), bio: clean(draft.bio) } };
  } catch (error) {
    return failureFrom(error, 'assist-profile');
  }
}

export async function draftOfferMessage(
  { db, writer, now }: { db: Db; writer: OfferMessageWriter | null; now: Date },
  userId: string,
  taskId: string,
  input: OfferMessageDraftInput,
): Promise<OfferMessageDraftResult> {
  if (!writer || !(await aiDraftingFlag(db, userId))) return { ok: false, code: 'unavailable' };
  const notes = String(input?.notes ?? '').trim().slice(0, 300);
  if (findProhibitedPhrase(notes, GLOBAL_PROHIBITED_PHRASES)) return { ok: false, code: 'prohibited' };

  // The task as this helper may see it: nothing for a task they can't offer on.
  const view = await getHelperTaskView(db, userId, String(taskId), now);
  if (!view || view.blockedReason) return { ok: false, code: 'unavailable' };
  const [helper] = await db
    .select({ firstName: users.firstName, headline: helperProfiles.headline, tools: helperProfiles.tools })
    .from(users)
    .innerJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!helper) return { ok: false, code: 'unavailable' };

  const limited = await consumeRateLimit(db, `assist:offer:${userId}`, OFFER_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  const rules = view.offerRules;
  const startTime = typeof input?.startTime === 'string' && rules.startTimes.includes(input.startTime) ? input.startTime : undefined;
  const brings = (Array.isArray(input?.brings) ? input.brings : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);
  try {
    const message = await writer.draft({
      helper: { firstName: helper.firstName || 'there', ...(helper.headline ? { headline: clean(helper.headline) } : {}), tools: helper.tools },
      task: {
        categorySlug: view.task.categorySlug,
        title: view.task.title,
        // Already masked for helpers.
        description: view.description,
        details: Object.entries(view.details).map(([key, value]) => `${key}: ${String(value)}`),
        dateLabel: formatDate(marketLocalToUtc(rules.date, rules.startTimes[0] ?? '12:00')),
        remote: view.task.location.kind === 'remote',
      },
      ...(startTime ? { startLabel: formatTime(marketLocalToUtc(rules.date, startTime)) } : {}),
      brings: brings.map(clean),
      notes: clean(notes),
      maxLength: rules.messageMaxLength,
    });
    return { ok: true, message: clean(message) };
  } catch (error) {
    return failureFrom(error, 'assist-offer');
  }
}
