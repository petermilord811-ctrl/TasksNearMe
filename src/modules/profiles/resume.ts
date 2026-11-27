import { and, eq } from 'drizzle-orm';
import {
  PROFILE_LIST_LIMITS,
  RESUME_RULES,
  resumeApplyInputSchema,
  type ActionResult,
  type CategorySlug,
  type ResumeApplyInput,
  type ResumeReadResult,
  type ResumeSuggestions,
} from '@/contracts';
import { basicResumeSuggestions, type ResumeReader } from '@/integrations/ai/resume-reader';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai/writer';
import { resumeFileKind, resumeText, type ResumeFileKind } from '@/integrations/ocr/resume-text';
import { users } from '@/modules/accounts/schema';
import { listCategoryViews } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { ensureDraftProfile } from '@/modules/verification/draft-profile';
import { serviceDefaultsFor } from '@/modules/verification/service-defaults';
import { syncHelperProfile } from '@/modules/verification/state';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { helperProfiles, helperServices } from './schema';

/**
 * "Import from resume" on the helper's profile (owner, 2026-11-27): read a resume and suggest (`readResume`), then save
 * what the helper kept (`applyResume`). The file and its text live only for the reading: nothing of them is stored or
 * logged, only what the helper applies.
 */

export interface ResumeDeps {
  db: Db;
  /** AI's reader (src/integrations/ai/resume-reader.ts), or null: suggestions from keywords alone. */
  reader: ResumeReader | null;
  /** Tests: the file's text without the reader's process. */
  extract?: (file: { bytes: Buffer; kind: ResumeFileKind }) => Promise<string | null>;
}

/** Readings a person can ask for in an hour (each one may call a model). */
const READ_RULE = { limit: 5, windowSeconds: 60 * 60 };
/** Fewer words than this isn't a resume to read (a scan, a cover page, an empty file). */
const MIN_WORDS = 30;
/** The profile's own caps (helperProfileInputSchema, helperToolsInputSchema). */
const PROFILE_CAPS = { languages: 6, tools: 20, toolLength: 40 } as const;

const wordCount = (text: string) => text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
const emptySuggestions = (suggestions: ResumeSuggestions) =>
  !suggestions.headline && !suggestions.bio && [suggestions.services, suggestions.skills, suggestions.tools, suggestions.likes, suggestions.excludes, suggestions.experience].every((list) => list.length === 0);

/** The categories a helper offers now (active services). */
async function offeredCategories(db: Db, userId: string): Promise<Set<CategorySlug>> {
  const rows = await db
    .select({ slug: categories.slug })
    .from(helperServices)
    .innerJoin(categories, eq(categories.id, helperServices.categoryId))
    .where(and(eq(helperServices.userId, userId), eq(helperServices.status, 'active')));
  return new Set(rows.map((row) => row.slug as CategorySlug));
}

/** Reads a resume (FormData with one `file`) and suggests; saves nothing. */
export async function readResume(deps: ResumeDeps, userId: string, form: FormData, now: Date): Promise<ResumeReadResult> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: 'unreadable' };
  const kind = resumeFileKind({ name: file.name, type: file.type });
  if (!kind) return { ok: false, code: 'unsupported_type' };
  if (file.size > RESUME_RULES.maxMegabytes * 1024 * 1024) return { ok: false, code: 'too_large' };
  const limited = await consumeRateLimit(deps.db, `resume-read:user:${userId}`, READ_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited' };

  let text: string | null;
  try {
    text = await (deps.extract ?? resumeText)({ bytes: Buffer.from(await file.arrayBuffer()), kind });
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    console.error('[resume] the reader failed:', error.name);
    return { ok: false, code: 'unavailable' };
  }
  if (!text || wordCount(text) < MIN_WORDS) return { ok: false, code: 'unreadable' };

  const [person] = await deps.db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  let suggestions: ResumeSuggestions | null = null;
  if (deps.reader) {
    try {
      suggestions = await deps.reader.read({ text, firstName: person?.firstName ?? '', lastName: person?.lastName ?? '' });
      if (emptySuggestions(suggestions)) suggestions = null;
    } catch (error) {
      if (!(error instanceof AiUnavailableError) && !(error instanceof AiRefusedError)) throw error;
      // Never the text: only that the model didn't answer.
      console.error('[resume] AI suggestions unavailable:', error.name);
    }
  }
  const by = suggestions ? 'ai' : 'basic';
  const chosen = suggestions ?? basicResumeSuggestions(text);
  const offered = await offeredCategories(deps.db, userId);
  return { ok: true, by, suggestions: { ...chosen, services: chosen.services.map((service) => ({ ...service, alreadyOffered: offered.has(service.categorySlug) })) } };
}

/** Each item once (case aside), the profile's first, at most `max`. */
function merged(current: readonly string[], added: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...current, ...added]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out.slice(0, max);
}

/**
 * Saves what the helper kept from the suggestions. Lists join what the profile has (case aside, within the profile's
 * caps); a headline, About text and experience replace the profile's only when given; a category not offered yet is
 * added at the market's usual price (the helper changes it under Services), and one already offered keeps its own
 * price and note (an empty note takes the suggestion's). Starts a draft profile when there's none.
 */
export async function applyResume(db: Db, userId: string, input: ResumeApplyInput, now: Date): Promise<ActionResult> {
  const parsed = resumeApplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  if (!(await ensureDraftProfile(db, userId))) return { ok: false, code: 'not_allowed' };
  const [[profile], [person]] = await Promise.all([
    db.select().from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  if (!profile) return { ok: false, code: 'not_allowed' };
  const data = parsed.data;
  const tools = data.tools.filter((tool) => tool.length >= 2 && tool.length <= PROFILE_CAPS.toolLength);
  await db
    .update(helperProfiles)
    .set({
      ...(data.headline ? { headline: data.headline } : {}),
      ...(data.bio ? { bio: data.bio } : {}),
      skills: merged(profile.skills, data.skills, PROFILE_LIST_LIMITS.skills.items),
      tools: merged(profile.tools, tools, PROFILE_CAPS.tools),
      likes: merged(profile.likes, data.likes, PROFILE_LIST_LIMITS.likes.items),
      excludes: merged(profile.excludes, data.excludes, PROFILE_LIST_LIMITS.excludes.items),
      languages: [...new Set([...profile.languages, ...data.languages])].slice(0, PROFILE_CAPS.languages),
      ...(data.experience.length > 0 ? { experience: data.experience } : {}),
      updatedAt: now.toISOString(),
    })
    .where(eq(helperProfiles.userId, userId));

  if (data.services.length > 0 && person?.marketId) {
    // Only categories this market offers, at its usual price (service-defaults.ts).
    const views = await listCategoryViews(person.marketId, db);
    const defaults = serviceDefaultsFor(views);
    const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
    const idOf = new Map(categoryRows.map((row) => [row.slug, row.id] as const));
    const existing = await db.select().from(helperServices).where(eq(helperServices.userId, userId));
    for (const service of data.services) {
      const categoryId = idOf.get(service.categorySlug);
      const pricing = defaults[service.categorySlug];
      if (!categoryId || !pricing) continue;
      const current = existing.find((row) => row.categoryId === categoryId);
      if (current?.status === 'active') {
        if (!current.description.trim() && service.description) await db.update(helperServices).set({ description: service.description }).where(eq(helperServices.id, current.id));
        continue;
      }
      const row = {
        id: current?.id ?? `svc_${userId.slice(4)}_${categoryId.slice(4)}`,
        userId,
        categoryId,
        pricingType: pricing.pricingType,
        fromPriceCents: pricing.pricingType === 'fixed' ? (pricing.fromPriceCents ?? null) : null,
        hourlyRateCents: pricing.pricingType === 'hourly' ? (pricing.hourlyRateCents ?? null) : null,
        minHours: pricing.pricingType === 'hourly' ? (pricing.minHours ?? null) : null,
        description: service.description,
        status: 'active',
      };
      await db.insert(helperServices).values(row).onConflictDoUpdate({ target: [helperServices.userId, helperServices.categoryId], set: row });
    }
  }
  await syncHelperProfile(db, userId, now);
  return { ok: true, code: 'saved' };
}
