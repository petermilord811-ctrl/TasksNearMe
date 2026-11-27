import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResumeSuggestions } from '@/contracts';
import { AiUnavailableError } from '@/integrations/ai';
import type { ResumeReader } from '@/integrations/ai/resume-reader';
import { users } from '@/modules/accounts/schema';
import { categories } from '@/modules/markets/schema';
import { applyResume, readResume } from '@/modules/profiles/resume';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/** "Import from resume" (2026-11-27): reading suggests and saves nothing; applying merges what the helper kept. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HELPER = 'usr_tmp_resume_helper';
const NEWBIE = 'usr_tmp_resume_new';
const PEOPLE = [HELPER, NEWBIE];
const now = new Date('2026-11-27T15:00:00.000Z');
const RESUME = `Experience\nFurniture assembler at Hyde Park Home Goods since 2022. ${'Built beds, desks and shelving for customers every week. '.repeat(4)}\nMover at Two Brothers Moving, 2019 to 2022.\nSkills\nPacking, Flat-pack assembly`;

const suggestions: ResumeSuggestions = {
  headline: 'Careful furniture assembly and moving help',
  bio: 'I have assembled furniture for Hyde Park Home Goods since 2022, and moved homes before that.',
  services: [
    { categorySlug: 'furniture-assembly', description: 'Beds, desks and shelving.', reason: 'Assembler since 2022', alreadyOffered: false },
    { categorySlug: 'moving-help', description: 'Loading and unloading.', reason: 'Mover 2019 to 2022', alreadyOffered: false },
  ],
  skills: ['Flat-pack assembly'],
  tools: [],
  languages: ['en'],
  likes: ['Big assembly jobs'],
  excludes: ['Pianos and safes'],
  experience: [{ title: 'Furniture assembler', organization: 'Hyde Park Home Goods', startYear: 2022, current: true }],
};

const form = (name = 'resume.txt', type = 'text/plain', body = RESUME) => {
  const data = new FormData();
  data.set('file', new File([body], name, { type }));
  return data;
};
const extract = async () => RESUME;
const reader = (read: ResumeReader['read']): ResumeReader => ({ name: 'stub', read: vi.fn(read) });

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    { ...chris!, id: HELPER, email: 'tmp-resume-helper@example.test', name: 'Hana R.', firstName: 'Hana', lastName: 'Resume', phone: '+15125550491', mode: 'helper' },
    { ...chris!, id: NEWBIE, email: 'tmp-resume-new@example.test', name: 'Noor R.', firstName: 'Noor', lastName: 'Resume', phone: '+15125550492' },
  ]);
  await db.insert(helperProfiles).values({ userId: HELPER, handle: 'tmp-resume-helper', headline: 'Help around the house', bio: 'I help neighbors with careful work and always leave the place tidy.', languages: ['en'], status: 'draft', areaId: 'area_mueller', skills: ['packing'], tools: ['Drill'] });
  const [furniture] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'furniture-assembly'));
  await db.insert(helperServices).values({ id: `svc_${HELPER}_fa`, userId: HELPER, categoryId: furniture!.id, pricingType: 'fixed', fromPriceCents: 6500, description: '', status: 'active' });
});

afterAll(async () => {
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, PEOPLE));
  await db.delete(helperServices).where(inArray(helperServices.userId, PEOPLE));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, PEOPLE));
  await db.delete(rateLimits).where(like(rateLimits.key, 'resume-read:user:usr_tmp_resume_%'));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('reading a resume', () => {
  it("suggests from AI, marking the categories the helper already offers, and saves nothing", async () => {
    const ai = reader(async () => suggestions);
    const result = await readResume({ db, reader: ai, extract }, HELPER, form(), now);
    expect(result).toEqual({
      ok: true,
      by: 'ai',
      suggestions: { ...suggestions, services: [{ ...suggestions.services[0]!, alreadyOffered: true }, suggestions.services[1]] },
    });
    expect(ai.read).toHaveBeenCalledWith({ text: RESUME, firstName: 'Hana', lastName: 'Resume' });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, HELPER));
    expect(profile).toMatchObject({ headline: 'Help around the house', skills: ['packing'] });
  });

  it('suggests from keywords when no model answers, or none is set up', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = await readResume({ db, reader: reader(async () => { throw new AiUnavailableError('down'); }), extract }, HELPER, form(), now);
    quiet.mockRestore();
    expect(down).toMatchObject({ ok: true, by: 'basic' });
    if (!down.ok) throw new Error('unreachable');
    expect(down.suggestions.services.map((service) => service.categorySlug)).toEqual(['furniture-assembly', 'moving-help']);
    expect(down.suggestions.headline).toBeUndefined();
    expect(await readResume({ db, reader: null, extract }, HELPER, form(), now)).toMatchObject({ ok: true, by: 'basic' });
  });

  it("refuses what it can't read, and more than five readings an hour", async () => {
    expect(await readResume({ db, reader: null, extract }, NEWBIE, form('photo.jpg', 'image/jpeg'), now)).toEqual({ ok: false, code: 'unsupported_type' });
    expect(await readResume({ db, reader: null, extract: async () => 'Too short to be a resume.' }, NEWBIE, form(), now)).toEqual({ ok: false, code: 'unreadable' });
    expect(await readResume({ db, reader: null, extract }, NEWBIE, form('big.pdf', 'application/pdf', 'x'.repeat(5 * 1024 * 1024 + 1)), now)).toEqual({ ok: false, code: 'too_large' });
    const empty = new FormData();
    expect(await readResume({ db, reader: null, extract }, NEWBIE, empty, now)).toEqual({ ok: false, code: 'unreadable' });
    // Five allowed an hour (the type and size checks above come before the count): the unreadable one was the first.
    for (let i = 0; i < 4; i++) expect((await readResume({ db, reader: null, extract }, NEWBIE, form(), now)).ok).toBe(true);
    expect(await readResume({ db, reader: null, extract }, NEWBIE, form(), now)).toEqual({ ok: false, code: 'rate_limited' });
  });
});

describe('applying what the helper kept', () => {
  it("merges lists, replaces the texts given, adds new categories at the market's price and keeps the helper's own", async () => {
    const result = await applyResume(db, HELPER, {
      headline: suggestions.headline,
      bio: suggestions.bio,
      services: suggestions.services.map(({ categorySlug, description }) => ({ categorySlug, description })),
      skills: ['Packing', 'Flat-pack assembly'],
      tools: ['Drill', 'Furniture dolly', 'A tool with a name far too long to keep on a profile'],
      languages: ['es'],
      likes: ['Big assembly jobs'],
      excludes: ['Pianos and safes'],
      experience: suggestions.experience,
    }, now);
    expect(result).toEqual({ ok: true, code: 'saved' });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, HELPER));
    expect(profile).toMatchObject({
      headline: 'Careful furniture assembly and moving help',
      bio: suggestions.bio,
      // Case aside, each once, the profile's first.
      skills: ['packing', 'Flat-pack assembly'],
      tools: ['Drill', 'Furniture dolly'],
      languages: ['en', 'es'],
      likes: ['Big assembly jobs'],
      excludes: ['Pianos and safes'],
      experience: suggestions.experience,
    });
    const services = await db
      .select({ slug: categories.slug, service: helperServices })
      .from(helperServices)
      .innerJoin(categories, eq(categories.id, helperServices.categoryId))
      .where(and(eq(helperServices.userId, HELPER), eq(helperServices.status, 'active')));
    const bySlug = Object.fromEntries(services.map(({ slug, service }) => [slug, service]));
    // Already offered: its own price stays, its empty note takes the suggestion's.
    expect(bySlug['furniture-assembly']).toMatchObject({ pricingType: 'fixed', fromPriceCents: 6500, description: 'Beds, desks and shelving.' });
    // New: the market's usual hourly price, with the suggestion's note.
    expect(bySlug['moving-help']).toMatchObject({ pricingType: 'hourly', description: 'Loading and unloading.' });
    expect(bySlug['moving-help']!.hourlyRateCents).toBeGreaterThan(0);
  });

  it("leaves texts alone when they aren't given, and starts a draft profile for someone without one", async () => {
    expect(await applyResume(db, NEWBIE, { services: [], skills: ['Wi-Fi setup'], tools: [], languages: [], likes: [], excludes: [], experience: [] }, now)).toEqual({ ok: true, code: 'saved' });
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, NEWBIE));
    expect(profile).toMatchObject({ status: 'draft', headline: '', bio: '', skills: ['Wi-Fi setup'], experience: [] });
  });

  it('checks what it saves', async () => {
    expect(await applyResume(db, HELPER, { headline: 'Short', services: [], skills: [], tools: [], languages: [], likes: [], excludes: [], experience: [] }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
  });
});
