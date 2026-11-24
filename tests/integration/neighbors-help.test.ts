import { and, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { neighborsAnswersOf } from '@/modules/community/answers';
import { askAlertsEnabled, saveAskAlerts } from '@/modules/community/ask-alerts';
import { ASK_ALERT_TYPE_LIST } from '@/modules/community/domain';
import { getPortal } from '@/modules/community/portal';
import { communityPosts, communityReactions, communityReplies, communityWelcomes } from '@/modules/community/schema';
import { createCommunityPost, setCommunityArea } from '@/modules/community/service';
import { dismissWelcome } from '@/modules/community/welcome';
import { areas } from '@/modules/markets/schema';
import { blocks } from '@/modules/messaging/schema';
import { notificationDeliveries, notificationPreferences, notifications } from '@/modules/notifications/schema';
import { getAccountPage, planNotifications } from '@/modules/notifications/service';
import { helperProfiles } from '@/modules/profiles/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/** Notifications go with their delivery rows: the job runner may have delivered them already (a foreign key). */
async function dropNotifications(where: SQL | undefined): Promise<void> {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(where);
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, ids));
  await db.delete(notifications).where(inArray(notifications.id, ids));
}

/**
 * Helpers answer on Neighbors and the welcome for new movers (2026-11-24), on the seeded Austin people: Maya (Mueller)
 * asks; Sam, Lee and Jordan offer furniture assembly; Ben marks answers Helpful. Every title is unique, and the people
 * this file makes are its own.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const now = new Date();
const maya = { id: 'usr_maya', staff: null };
const FURNITURE_HELPERS = ['usr_sam', 'usr_lee', 'usr_jordan'];
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cleanups: (() => Promise<unknown>)[] = [];
const DAY = 86_400_000;

async function clearAskAlerts() {
  // Alerts planned elsewhere for these helpers today would cap them here (3 a day).
  await dropNotifications(and(inArray(notifications.userId, FURNITURE_HELPERS), inArray(notifications.type, [...ASK_ALERT_TYPE_LIST]), gte(notifications.createdAt, new Date(now.getTime() - 2 * DAY))));
}

beforeAll(clearAskAlerts);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  await db.delete(rateLimits).where(eq(rateLimits.key, 'community:post:usr_maya'));
  await db.delete(outboxEvents).where(and(sql`${outboxEvents.type} like 'community.%'`, sql`${outboxEvents.createdAt} >= ${now}`));
  await clearAskAlerts();
  await pool.end();
});

async function ask(input: { kind: 'question' | 'recommendation' | 'tip'; categorySlug?: string; areaSlug?: string; title?: string; body?: string }) {
  await db.delete(rateLimits).where(eq(rateLimits.key, 'community:post:usr_maya'));
  const result = await createCommunityPost(db, maya, { title: `${input.title ?? 'Can two people move a sleeper sofa'} ${unique()}`, body: input.body ?? 'Up one flight of stairs, this weekend.', ...input }, now);
  expect(result).toMatchObject({ ok: true, code: 'sent' });
  const id = (result as { redirectTo: string }).redirectTo.split('/').at(-1)!;
  cleanups.push(() => db.delete(communityPosts).where(eq(communityPosts.id, id)));
  return id;
}

/** Who a post's alert would reach, and as which type. */
async function alertsFor(postId: string) {
  const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.posted'), eq(outboxEvents.aggregateId, postId)));
  const planned = await planNotifications(db, event!);
  return planned.filter((item) => (ASK_ALERT_TYPE_LIST as readonly string[]).includes(item.type));
}
const helpersOf = async (postId: string) => (await alertsFor(postId)).map((item) => item.userId);

describe('ask alerts for questions (2026-11-24)', () => {
  it('alerts the helpers who do the service about a question, with its own type', async () => {
    const planned = await alertsFor(await ask({ kind: 'question', categorySlug: 'furniture-assembly' }));
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((item) => item.type === 'community_question_match' && item.userId !== 'usr_maya' && item.params?.area)).toBe(true);
    // A question without a service, and a tip with one, alert nobody.
    expect(await alertsFor(await ask({ kind: 'question' }))).toEqual([]);
    expect(await alertsFor(await ask({ kind: 'tip', title: 'Tip: anchor tall dressers', body: 'Straps cost a few dollars and take ten minutes.', categorySlug: 'furniture-assembly' }))).toEqual([]);
    // A recommendation request keeps its own type.
    const asked = await alertsFor(await ask({ kind: 'recommendation', title: 'Who builds bunk beds?', categorySlug: 'furniture-assembly' }));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((item) => item.type === 'community_ask_match')).toBe(true);
  });

  it('shares the 3-a-day cap with recommendation alerts', async () => {
    const postId = await ask({ kind: 'question', categorySlug: 'furniture-assembly' });
    const [target] = await helpersOf(postId);
    expect(target).toBeDefined();
    const ids = [newId('ntf'), newId('ntf'), newId('ntf')];
    const types = ['community_ask_match', 'community_ask_match', 'community_question_match'];
    await db.insert(notifications).values(ids.map((id, index) => ({ id, userId: target!, type: types[index]!, target: { kind: 'community_post' as const, postId: 'cpo_cap' }, sourceEventId: `evt_cap_${id}` })));
    cleanups.push(() => dropNotifications(inArray(notifications.id, ids)));
    expect(await helpersOf(postId)).not.toContain(target);
    // Two today leave room for a third.
    await dropNotifications(eq(notifications.id, ids[2]!));
    expect(await helpersOf(postId)).toContain(target);
    await dropNotifications(inArray(notifications.id, ids));
  });

  it('never alerts a helper who turned them off, or anyone either side blocked', async () => {
    const postId = await ask({ kind: 'question', categorySlug: 'furniture-assembly' });
    const [target] = await helpersOf(postId);
    expect(target).toBeDefined();
    cleanups.push(() => db.delete(notificationPreferences).where(and(eq(notificationPreferences.userId, target!), eq(notificationPreferences.topic, 'neighbors_asks'))));
    expect(await saveAskAlerts(db, target!, { enabled: false }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await askAlertsEnabled(db, target!)).toBe(false);
    expect(await helpersOf(postId)).not.toContain(target);
    await saveAskAlerts(db, target!, { enabled: true }, now);
    expect(await helpersOf(postId)).toContain(target);

    await db.insert(blocks).values({ blockerId: target!, blockedId: 'usr_maya', createdAt: now }).onConflictDoNothing();
    cleanups.push(() => db.delete(blocks).where(and(eq(blocks.blockerId, target!), eq(blocks.blockedId, 'usr_maya'))));
    expect(await helpersOf(postId)).not.toContain(target);
    await db.delete(blocks).where(and(eq(blocks.blockerId, target!), eq(blocks.blockedId, 'usr_maya')));
  });

  it('reaches only helpers whose area covers the neighborhood (anyone in the city for a citywide ask)', async () => {
    const postId = await ask({ kind: 'question', categorySlug: 'furniture-assembly', areaSlug: 'mueller' });
    const [post] = await db.select({ areaId: communityPosts.areaId }).from(communityPosts).where(eq(communityPosts.id, postId));
    const baseline = await helpersOf(postId);
    const rows = await db.select({ userId: helperProfiles.userId, areaId: helperProfiles.areaId, radiusKm: helperProfiles.serviceRadiusKm }).from(helperProfiles).where(inArray(helperProfiles.userId, baseline));
    const far = rows.find((row) => row.areaId !== post?.areaId);
    expect(far).toBeDefined();
    cleanups.push(() => db.update(helperProfiles).set({ serviceRadiusKm: far!.radiusKm }).where(eq(helperProfiles.userId, far!.userId)));
    await db.update(helperProfiles).set({ serviceRadiusKm: 0 }).where(eq(helperProfiles.userId, far!.userId));
    expect(await helpersOf(postId)).not.toContain(far!.userId);
    expect(await helpersOf(await ask({ kind: 'question', categorySlug: 'furniture-assembly', areaSlug: '' }))).toContain(far!.userId);
    await db.update(helperProfiles).set({ serviceRadiusKm: far!.radiusKm }).where(eq(helperProfiles.userId, far!.userId));
  });

  it('shows the switch on a helper’s account page only', async () => {
    expect((await getAccountPage(db, 'usr_jordan', {}, now))?.askAlerts).toEqual({ enabled: true });
    expect((await getAccountPage(db, 'usr_maya', {}, now))?.askAlerts).toBeUndefined();
  });
});

describe('credit for helpful answers (2026-11-24)', () => {
  const sam = 'usr_sam';
  async function question(title: string, patch: Partial<typeof communityPosts.$inferInsert> = {}) {
    const id = newId('cpo');
    await db.insert(communityPosts).values({ id, marketId: 'mkt_austin', authorUserId: 'usr_maya', kind: 'question', title: `${title} ${unique()}`, body: '', ...patch });
    cleanups.push(() => db.delete(communityPosts).where(eq(communityPosts.id, id)));
    return id;
  }
  async function answer(postId: string, markedBy: string[], patch: Partial<typeof communityReplies.$inferInsert> = {}) {
    const id = newId('crp');
    await db.insert(communityReplies).values({ id, postId, authorUserId: sam, body: 'Strap it to a stud: a kit costs a few dollars and takes ten minutes, and it can’t tip once two drawers are open.', ...patch });
    if (markedBy.length > 0) await db.insert(communityReactions).values(markedBy.map((userId) => ({ targetKind: 'reply', targetId: id, userId, kind: 'helpful' })));
    cleanups.push(() => db.delete(communityReactions).where(and(eq(communityReactions.targetKind, 'reply'), eq(communityReactions.targetId, id))));
    return id;
  }

  it('counts distinct posts where someone else marked a visible answer Helpful, never removed, hidden, own or sample rows', async () => {
    const before = (await neighborsAnswersOf(db, sam, 'all'))?.helpedCount ?? 0;
    const beforeReal = (await neighborsAnswersOf(db, sam, 'real'))?.helpedCount ?? 0;
    const counted = await question('Is it worth anchoring a short dresser?');
    const best = await answer(counted, ['usr_ben', 'usr_chris']);
    const twice = await question('Do PAX doors need adjusting?');
    await answer(twice, ['usr_ben']);
    await answer(twice, ['usr_ana']);
    await answer(await question('Removed answer'), ['usr_ben'], { status: 'removed' });
    await answer(await question('Hidden question', { status: 'hidden' }), ['usr_ben']);
    await answer(await question('Sam’s own question', { authorUserId: sam }), ['usr_ben']);
    await answer(await question('Only Sam marked it'), [sam]);
    await answer(await question('Thanks post', { kind: 'thanks' }), ['usr_ben']);

    const after = await neighborsAnswersOf(db, sam, 'all');
    expect(after?.helpedCount).toBe(before + 2);
    // Their best answer leads, quoted short, with where it was asked.
    const top = after?.answers.find((item) => item.id === best);
    expect(top).toMatchObject({ helpfulCount: 2, placeName: 'Austin' });
    expect(top?.questionTitle).toMatch(/^Is it worth anchoring a short dresser\?/);
    expect(after!.answers.length).toBeLessThanOrEqual(3);

    // Where samples are hidden, marks by sample people (the seeded cast) don't count; a real neighbor's does.
    expect((await neighborsAnswersOf(db, sam, 'real'))?.helpedCount ?? 0).toBe(beforeReal);
    const realNeighbor = newId('usr');
    await db.insert(users).values({ id: realNeighbor, email: `${realNeighbor}@example.test`, name: 'Rae N.', firstName: 'Rae', lastName: 'Neighbor', homeMarketId: 'mkt_austin' });
    cleanups.push(() => db.delete(users).where(eq(users.id, realNeighbor)));
    await db.insert(communityReactions).values({ targetKind: 'reply', targetId: best, userId: realNeighbor, kind: 'helpful' });
    cleanups.push(() => db.delete(communityReactions).where(eq(communityReactions.userId, realNeighbor)));
    expect((await neighborsAnswersOf(db, sam, 'real'))?.helpedCount).toBe(beforeReal + 1);

    // On the profile (and so its peek).
    const [profile] = await db.select({ handle: helperProfiles.handle }).from(helperProfiles).where(eq(helperProfiles.userId, sam));
    const page = await getHelperProfile(profile!.handle, db, 'all');
    expect(page?.neighborsAnswers?.helpedCount).toBe(before + 2);
  });
});

describe('the welcome for new movers (2026-11-24)', () => {
  async function person(createdAt: Date) {
    const id = newId('usr');
    await db.insert(users).values({ id, email: `${id}@example.test`, name: 'Wes M.', firstName: 'Wes', lastName: 'Mover', homeMarketId: 'mkt_austin', createdAt, updatedAt: createdAt });
    cleanups.push(() => db.delete(users).where(eq(users.id, id)));
    return { id, staff: null };
  }
  const welcomeOf = async (viewer: { id: string; staff: null; rows?: 'all' | 'real' }) => (await getPortal(db, viewer, {}, now))?.welcome;

  it('welcomes once per move: a closed welcome stays closed, and the next move brings a new one', async () => {
    const wes = await person(new Date(now.getTime() - 400 * DAY));
    // An old account that hasn't moved: nothing.
    expect(await welcomeOf(wes)).toBeUndefined();
    expect(await setCommunityArea(db, wes, { areaSlug: 'hyde-park' }, now)).toMatchObject({ ok: true });
    const first = await welcomeOf(wes);
    expect(first?.placeName).toBe('Hyde Park');
    // Still there on the next visit (and on any device): kept on the server.
    expect((await welcomeOf(wes))?.id).toBe(first?.id);
    // A page from before names another welcome: nothing changes.
    expect(await dismissWelcome(db, wes, { id: 'mkt_austin:joined' }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await welcomeOf(wes))?.id).toBe(first?.id);
    expect(await dismissWelcome(db, wes, { id: first!.id }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await welcomeOf(wes)).toBeUndefined();
    // Choosing the same neighborhood again isn't a move.
    await setCommunityArea(db, wes, { areaSlug: 'hyde-park' }, new Date(now.getTime() + 1000));
    expect(await welcomeOf(wes)).toBeUndefined();
    // Forgetting it isn't either.
    await setCommunityArea(db, wes, { areaSlug: '' }, new Date(now.getTime() + 2000));
    expect(await welcomeOf(wes)).toBeUndefined();
    // Another neighborhood is.
    await setCommunityArea(db, wes, { areaSlug: 'mueller' }, new Date(now.getTime() + 3000));
    const second = await welcomeOf(wes);
    expect(second?.placeName).toBe('Mueller');
    expect(second?.id).not.toBe(first?.id);
  });

  it('welcomes a new account to its market, and someone whose market changed since their last welcome', async () => {
    const newbie = await person(now);
    const joined = await welcomeOf(newbie);
    expect(joined).toMatchObject({ id: 'mkt_austin:joined', placeName: 'Austin' });
    expect(await dismissWelcome(db, newbie, { id: joined!.id }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await welcomeOf(newbie)).toBeUndefined();
    // Their welcome was kept for Gainesville; they're in Austin now.
    await db.update(communityWelcomes).set({ marketId: 'mkt_gainesville', areaId: null }).where(eq(communityWelcomes.userId, newbie.id));
    expect((await welcomeOf(newbie))?.id).toBe('mkt_austin:moved');
  });

  it('shows the best-rated helpers and most helpful tips nearby, never someone blocked, a hidden tip or the demo marketplace', async () => {
    const wes = await person(new Date(now.getTime() - 400 * DAY));
    await setCommunityArea(db, wes, { areaSlug: 'mueller' }, now);
    const [mueller] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.marketId, 'mkt_austin'), eq(areas.slug, 'mueller')));
    const tipId = newId('cpo');
    const hiddenTipId = newId('cpo');
    await db.insert(communityPosts).values([
      { id: tipId, marketId: 'mkt_austin', areaId: mueller!.id, authorUserId: 'usr_ben', kind: 'tip', title: `Bulk pickup is the first Monday ${unique()}`, body: 'Book it online by Friday.', helpfulCount: 9999 },
      { id: hiddenTipId, marketId: 'mkt_austin', areaId: mueller!.id, authorUserId: 'usr_ben', kind: 'tip', title: `Hidden tip ${unique()}`, body: 'Hidden by staff.', helpfulCount: 10_000, status: 'hidden' },
    ]);
    cleanups.push(() => db.delete(communityPosts).where(inArray(communityPosts.id, [tipId, hiddenTipId])));
    const welcome = await welcomeOf(wes);
    expect(welcome?.tips[0]?.id).toBe(tipId);
    expect(welcome?.tips.map((tip) => tip.id)).not.toContain(hiddenTipId);
    expect(welcome!.tips.length).toBeLessThanOrEqual(3);
    expect(welcome!.helpers.length).toBeGreaterThan(0);
    expect(welcome!.helpers.length).toBeLessThanOrEqual(4);
    const rated = welcome!.helpers.map((helper) => (helper.rating ? 1 : 0));
    expect(rated).toEqual([...rated].sort((a, b) => b - a));

    // Someone they blocked (or who blocked them) never shows.
    const [first] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.handle, welcome!.helpers[0]!.handle));
    await db.insert(blocks).values({ blockerId: first!.userId, blockedId: wes.id, createdAt: now });
    cleanups.push(() => db.delete(blocks).where(eq(blocks.blockedId, wes.id)));
    expect((await welcomeOf(wes))?.helpers.map((helper) => helper.handle)).not.toContain(welcome!.helpers[0]!.handle);

    // Where Neighbors hides the demo marketplace: no seeded (sample) helper; a real post still shows.
    const real = await welcomeOf({ ...wes, rows: 'real' });
    expect(real?.helpers).toEqual([]);
    expect(real?.tips.map((tip) => tip.id)).toContain(tipId);
  });
});
