import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { adminAnnouncements, announcementFor, dismissAnnouncement, endAnnouncement, publishAnnouncement } from '@/modules/community/announcements';
import { runCommunityDigests } from '@/modules/community/digest';
import { followNoticeKey } from '@/modules/community/domain';
import { neighborsCard, neighborsNewsOf } from '@/modules/community/home';
import { communityMetrics } from '@/modules/community/metrics';
import { hideAfterReports } from '@/modules/community/moderation';
import { canViewCommunityPhoto, COMMUNITY_PHOTO_KIND } from '@/modules/community/photos';
import { getPortal } from '@/modules/community/portal';
import { communityAnnouncements, communityEdits, communityFollows, communityPhotos, communityPosts, communityReplies } from '@/modules/community/schema';
import {
  createCommunityPost,
  editCommunityItem,
  followCommunityPost,
  getCommunityPost,
  reactInCommunity,
  reactorsOf,
  replyToCommunityPost,
  saveCommunityPost,
  setCommunityArea,
  viewerFacts,
} from '@/modules/community/service';
import { translateCommunityItem } from '@/modules/community/translate';
import { createFakeTranslator } from '@/integrations/ai/translator';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { planNotifications } from '@/modules/notifications/service';
import { supportCases } from '@/modules/support/schema';
import { reportTarget } from '@/modules/support/target-reports';
import { files } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Neighbors, plan 10 (docs/ui/neighbors-10.md) on the seeded Austin people: Maya (poster, Mueller), Lee, Sam and Jordan
 * (helpers offering furniture assembly), Ben, Chris, Ana and Ruth (posters), Riley (admin), Taylor (trust and safety).
 * Every post has a unique title and checks look for their own rows, since other test files share the database.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const now = new Date();
const maya = { id: 'usr_maya', staff: null };
const lee = { id: 'usr_lee', staff: null };
const ben = { id: 'usr_ben', staff: null };
const chris = { id: 'usr_chris', staff: null };
const ana = { id: 'usr_ana', staff: null };
const grace = { id: 'usr_grace', staff: null };
const riley = { id: 'usr_riley', roles: ['admin' as const] };
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cleanups: (() => Promise<unknown>)[] = [];

/** The seeded people this file writes as: their community and report limits start and end clean for the other files. */
const WRITERS = ['usr_maya', 'usr_lee', 'usr_ben', 'usr_chris', 'usr_ana'];
async function clearLimits() {
  const keys = WRITERS.flatMap((id) => [`community:post:${id}`, `community:reply:${id}`, `community:react:${id}`, `community:save:${id}`, `community:edit:${id}`, `community:translate:${id}`, `report:${id}`]);
  await db.delete(rateLimits).where(inArray(rateLimits.key, keys));
}

beforeAll(clearLimits);

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  await clearLimits();
  // This file's community events go too, so a later file's dispatch doesn't turn them into alerts for seeded helpers.
  await db.delete(outboxEvents).where(and(sql`${outboxEvents.type} like 'community.%'`, sql`${outboxEvents.createdAt} >= ${now}`));
  await pool.end();
});

async function post(viewer: { id: string; staff: null }, input: Partial<Parameters<typeof createCommunityPost>[2]> & { title: string }) {
  // This file posts as Maya more often than a day's limit (8) allows; the limit itself is community.test's.
  await db.delete(rateLimits).where(eq(rateLimits.key, `community:post:${viewer.id}`));
  const result = await createCommunityPost(db, viewer, { kind: 'question', body: 'Weekend mornings work best for us.', ...input }, now);
  expect(result).toMatchObject({ ok: true, code: 'sent' });
  return (result as { redirectTo: string }).redirectTo.split('/').at(-1)!;
}

async function photoFile(ownerUserId: string) {
  const id = newId('fil');
  await db.insert(files).values({ id, ownerUserId, kind: COMMUNITY_PHOTO_KIND, storageKey: `${COMMUNITY_PHOTO_KIND}/${id}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 1024, alt: '' });
  return id;
}

describe('posting (plan 10.6, 10.20, 10.13)', () => {
  it('takes an ask without details, but a tip needs them', async () => {
    const ask = await createCommunityPost(db, maya, { kind: 'recommendation', title: `Who mounts curtain rods? ${unique()}`, body: '' }, now);
    expect(ask).toMatchObject({ ok: true, code: 'sent' });
    const tip = await createCommunityPost(db, maya, { kind: 'tip', title: `Measure twice ${unique()}`, body: 'short' }, now);
    expect(tip).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { body: ['too_short'] } });
  });

  it('asks for another look at unkind words, and posts them once the author confirms', async () => {
    const title = `Lazy movers ${unique()}`;
    const first = await createCommunityPost(db, maya, { kind: 'question', title, body: 'The last crew was a bunch of idiots who broke my lamp.' }, now);
    expect(first).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { body: ['unkind'] } });
    const second = await createCommunityPost(db, maya, { kind: 'question', title, body: 'The last crew was a bunch of idiots who broke my lamp.', kindnessConfirmed: true }, now);
    expect(second).toMatchObject({ ok: true, code: 'sent' });
  });

  it('says what Sparks a post earned, until the day’s cap', async () => {
    const results = [];
    for (let index = 0; index < 4; index += 1) results.push(await createCommunityPost(db, ben, { kind: 'question', title: `Ben asks ${index} ${unique()}`, body: '' }, now));
    expect(results.every((result) => result.ok)).toBe(true);
    // Ben's earlier posts today (other files) may already count; the last of four is past the cap of 3 either way.
    expect(results.at(-1)).not.toHaveProperty('sparks');
  });
});

describe('photos (plan 10.1)', () => {
  it('attaches the author’s own uploads in order and shows them to neighbors in the market only', async () => {
    const [first, second] = [await photoFile('usr_maya'), await photoFile('usr_maya')];
    const id = await post(maya, { title: `Boxes everywhere ${unique()}`, photoIds: [first, second] });
    const page = await getCommunityPost(db, lee, id, now);
    expect(page?.post.photos?.map((photo) => photo.id)).toEqual([first, second]);
    expect(await canViewCommunityPhoto(db, first, 'usr_lee')).toBe(true);
    // Grace lives in Gainesville: not this market's post.
    expect(await canViewCommunityPhoto(db, first, 'usr_grace')).toBe(false);
    await db.insert(blocks).values({ blockerId: 'usr_maya', blockedId: 'usr_ben' });
    try {
      expect(await canViewCommunityPhoto(db, first, 'usr_ben')).toBe(false);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_maya'), eq(blocks.blockedId, 'usr_ben')));
    }
  });

  it('refuses someone else’s upload, and one already used', async () => {
    const leeFile = await photoFile('usr_lee');
    const refused = await createCommunityPost(db, maya, { kind: 'question', title: `Not my photo ${unique()}`, body: '', photoIds: [leeFile] }, now);
    expect(refused).toMatchObject({ ok: false, fieldErrors: { photoIds: ['invalid'] } });
    const mine = await photoFile('usr_maya');
    await post(maya, { title: `First use ${unique()}`, photoIds: [mine] });
    const again = await createCommunityPost(db, maya, { kind: 'question', title: `Second use ${unique()}`, body: '', photoIds: [mine] }, now);
    expect(again).toMatchObject({ ok: false, fieldErrors: { photoIds: ['invalid'] } });
  });
});

describe('editing (plan 10.5)', () => {
  it('lets the author edit, says Edited, masks the new words and keeps the old ones for staff', async () => {
    const id = await post(maya, { title: `Edit me ${unique()}`, body: 'Original details for the desk.' });
    expect(await editCommunityItem(db, lee, { target: 'post', id, title: 'Hijacked title', body: 'Not yours.' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await editCommunityItem(db, maya, { target: 'post', id, title: 'Edited title here', body: 'Call me at 512-555-0199 instead.' }, now)).toMatchObject({ ok: true, code: 'updated' });
    const [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(row?.title).toBe('Edited title here');
    expect(row?.body).not.toContain('512-555-0199');
    expect(row?.editedAt).not.toBeNull();
    const history = await db.select().from(communityEdits).where(and(eq(communityEdits.targetKind, 'post'), eq(communityEdits.targetId, id)));
    expect(history).toEqual([expect.objectContaining({ editorUserId: 'usr_maya', body: 'Original details for the desk.' })]);
    expect((await getCommunityPost(db, lee, id, now))?.post.editedAt).toBeDefined();
  });

  it('edits a reply, with the kindness reminder', async () => {
    const id = await post(maya, { title: `Reply edits ${unique()}` });
    expect(await replyToCommunityPost(db, lee, id, { body: 'Saturday works for me.' }, now)).toMatchObject({ ok: true });
    const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.postId, id));
    expect(await editCommunityItem(db, lee, { target: 'reply', id: reply!.id, body: 'You are an idiot.' }, now)).toMatchObject({ ok: false, fieldErrors: { body: ['unkind'] } });
    expect(await editCommunityItem(db, lee, { target: 'reply', id: reply!.id, body: 'Saturday morning works for me.' }, now)).toMatchObject({ ok: true });
    const page = await getCommunityPost(db, maya, id, now);
    expect(page?.replies[0]).toMatchObject({ body: 'Saturday morning works for me.', editedAt: expect.any(String) });
  });
});

describe('following and replies that name someone (plan 10.9, 10.10, 10.11)', () => {
  it('follows what you wrote, replied to or saved, and tells each person once', async () => {
    const title = `Follow me ${unique()}`;
    const id = await post(maya, { title, kind: 'recommendation', categorySlug: 'furniture-assembly' });
    expect(await saveCommunityPost(db, ana, { postId: id, saved: true }, now)).toMatchObject({ ok: true });
    expect(await replyToCommunityPost(db, chris, id, { body: 'Ask Lee, he did our desk.' }, now)).toMatchObject({ ok: true });
    const [chrisReply] = await db.select().from(communityReplies).where(and(eq(communityReplies.postId, id), eq(communityReplies.authorUserId, 'usr_chris')));
    const follows = await db.select().from(communityFollows).where(eq(communityFollows.postId, id));
    expect(follows.map((row) => row.userId).sort()).toEqual(['usr_ana', 'usr_chris', 'usr_maya']);
    // Lee answers Chris directly.
    expect(await replyToCommunityPost(db, lee, id, { body: 'Thanks, Chris! Happy to help again.', replyToId: chrisReply!.id }, now)).toMatchObject({ ok: true });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.replied'), eq(outboxEvents.aggregateId, id), sql`${outboxEvents.payload}->>'replierUserId' = 'usr_lee'`));
    const planned = await planNotifications(db, event!);
    expect(planned).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'usr_maya', type: 'community_reply' }),
      expect.objectContaining({ userId: 'usr_chris', type: 'community_mention' }),
      expect.objectContaining({ userId: 'usr_ana', type: 'community_followed_reply', sourceKey: followNoticeKey(id, new Date(event!.createdAt)) }),
    ]));
    expect(planned.filter((item) => item.userId === 'usr_chris')).toHaveLength(1);
    expect(planned.some((item) => item.userId === 'usr_lee')).toBe(false);
  });

  it('never tells someone who muted the post', async () => {
    const id = await post(maya, { title: `Mute me ${unique()}` });
    expect(await followCommunityPost(db, ana, { postId: id, state: 'following' }, now)).toMatchObject({ ok: true });
    expect(await followCommunityPost(db, maya, { postId: id, state: 'muted' }, now)).toMatchObject({ ok: true });
    expect(await replyToCommunityPost(db, lee, id, { body: 'I can help with this.' }, now)).toMatchObject({ ok: true });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.replied'), eq(outboxEvents.aggregateId, id)));
    const planned = await planNotifications(db, event!);
    expect(planned.map((item) => item.userId)).toEqual(['usr_ana']);
    const page = await getCommunityPost(db, maya, id, now);
    expect(page?.post.follow).toBe('muted');
  });

  it('tells a thanked helper, and alerts helpers who offer the service nearby (at most 3 a day each)', async () => {
    const recommendation = await post(maya, { title: `Who builds bunk beds? ${unique()}`, kind: 'recommendation', categorySlug: 'furniture-assembly' });
    const [asked] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.posted'), eq(outboxEvents.aggregateId, recommendation)));
    // Lee already had three today: he isn't told again.
    const capIds = [0, 1, 2].map(() => newId('ntf'));
    await db.insert(notifications).values(capIds.map((id) => ({ id, userId: 'usr_lee', type: 'community_ask_match', target: { kind: 'community_post' as const, postId: 'cpo_cap' }, sourceEventId: `evt_cap_${id}` })));
    cleanups.push(() => db.delete(notifications).where(inArray(notifications.id, capIds)));
    const planned = await planNotifications(db, asked!);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((item) => item.type === 'community_ask_match' && item.userId !== 'usr_maya' && item.userId !== 'usr_lee')).toBe(true);
    expect(planned[0]?.params?.area).toBeTruthy();
  });
});

describe('who reacted, and translations (plan 10.2, 10.23)', () => {
  it('names the people who found a post helpful, never anyone blocked', async () => {
    const id = await post(maya, { title: `Helpful names ${unique()}` });
    await reactInCommunity(db, lee, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now);
    await reactInCommunity(db, chris, { targetKind: 'post', targetId: id, kind: 'helpful', on: true }, now);
    const card = await getCommunityPost(db, ana, id, now);
    expect(card?.post.helpfulNames).toEqual(expect.arrayContaining(['Lee M.', 'Chris D.']));
    await db.insert(blocks).values({ blockerId: 'usr_ana', blockedId: 'usr_chris' });
    try {
      const reactors = await reactorsOf(db, ana, { target: 'post', id });
      expect(reactors?.helpful).toEqual(['Lee M.']);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_ana'), eq(blocks.blockedId, 'usr_chris')));
    }
  });

  it('translates a post on request, and not without a translator', async () => {
    const id = await post(maya, { title: `Translate me ${unique()}`, body: 'Who can help this weekend?' });
    expect(await translateCommunityItem(db, { ...lee, locale: 'es' }, { target: 'post', id }, now, createFakeTranslator())).toMatchObject({ body: '[ES] Who can help this weekend?' });
    expect(await translateCommunityItem(db, lee, { target: 'post', id }, now, null)).toBeNull();
  });
});

describe('hidden after reports (plan 10.21)', () => {
  it('hides a post once three established accounts report it, and tells its author', async () => {
    // Someone of this file's own writes it (reports against a seeded person would follow them into other files);
    // Maya, Ben and Ana (accounts weeks old) report it.
    const author = newId('usr');
    await db.insert(users).values({ id: author, email: `${author}@example.test`, name: 'Rex T.', firstName: 'Rex', lastName: 'T', homeMarketId: 'mkt_austin', termsAcceptedAt: now, adultAttestedAt: now });
    const id = newId('cpo');
    await db.insert(communityPosts).values({ id, marketId: 'mkt_austin', authorUserId: author, kind: 'question', title: `Report me ${unique()}`, body: 'Cheap movers this weekend, message me.', lastActivityAt: now, createdAt: now, updatedAt: now });
    cleanups.push(async () => {
      const cases = await db.select({ id: supportCases.id }).from(supportCases).where(sql`${supportCases.context}->>'postId' = ${id}`);
      if (cases.length > 0) {
        await db.execute(sql`delete from support_case_events where case_id in (${sql.join(cases.map((row) => sql`${row.id}`), sql`, `)})`);
        await db.execute(sql`delete from support_case_reads where case_id in (${sql.join(cases.map((row) => sql`${row.id}`), sql`, `)})`);
        await db.delete(supportCases).where(inArray(supportCases.id, cases.map((row) => row.id)));
      }
    });
    for (const reporter of ['usr_maya', 'usr_ben']) expect(await reportTarget(db, reporter, 'post', id, { reason: 'inappropriate_content', details: 'Advertising a moving company.' }, now)).toMatchObject({ ok: true });
    expect((await db.select({ status: communityPosts.status }).from(communityPosts).where(eq(communityPosts.id, id)))[0]?.status).toBe('visible');
    expect(await reportTarget(db, 'usr_ana', 'post', id, { reason: 'inappropriate_content', details: 'Advertising a moving company.' }, now)).toMatchObject({ ok: true });
    const [row] = await db.select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(row).toMatchObject({ status: 'hidden', moderationReason: 'reports' });
    const audited = await db.select().from(auditLog).where(and(eq(auditLog.action, 'community.post.auto_hide'), eq(auditLog.targetId, id)));
    expect(audited).toHaveLength(1);
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.auto_hidden'), eq(outboxEvents.aggregateId, id)));
    expect(await planNotifications(db, event!)).toEqual([expect.objectContaining({ userId: author, type: 'community_auto_hidden', params: { on: 'post' } })]);
    const cases = await db.select({ priority: supportCases.priority }).from(supportCases).where(sql`${supportCases.context}->>'postId' = ${id}`);
    expect(cases.every((item) => item.priority === 'high')).toBe(true);
    // Hidden already: another check changes nothing.
    expect(await hideAfterReports(db, 'post', id, now)).toBe(false);
  });
});

describe('your neighborhood, Unanswered, announcements (plan 10.15–10.17)', () => {
  it('starts Near you from the neighborhood a member chose', async () => {
    const before = await viewerFacts(db, 'usr_ana');
    expect(await setCommunityArea(db, ana, { areaSlug: 'no-such-place' }, now)).toMatchObject({ ok: false, fieldErrors: { areaSlug: ['invalid'] } });
    expect(await setCommunityArea(db, ana, { areaSlug: 'hyde-park' }, now)).toMatchObject({ ok: true });
    cleanups.push(() => db.update(users).set({ homeAreaId: null }).where(eq(users.id, 'usr_ana')));
    expect((await viewerFacts(db, 'usr_ana'))?.area?.slug).toBe('hyde-park');
    const portal = await getPortal(db, ana, {}, now);
    expect(portal?.place).toEqual({ kind: 'nearby', areaName: 'Hyde Park' });
    expect(portal?.askArea).toBeUndefined();
    expect(before).not.toBeNull();
  });

  it('lists asks nobody answered, until someone does', async () => {
    const title = `Unanswered ${unique()}`;
    const id = await post(maya, { title, kind: 'question' });
    const waiting = await getPortal(db, lee, { area: 'all', unanswered: '1', sort: 'new' }, now);
    expect(waiting?.items.some((item) => item.id === id)).toBe(true);
    expect(waiting?.items.every((item) => item.type === 'post' && item.post.replyCount === 0)).toBe(true);
    await replyToCommunityPost(db, lee, id, { body: 'Yes, every Tuesday.' }, now);
    const after = await getPortal(db, lee, { area: 'all', unanswered: '1', sort: 'new' }, now);
    expect(after?.items.some((item) => item.id === id)).toBe(false);
  });

  it('pins an admin’s card for the market until a member closes it', async () => {
    const endsDate = new Date(now.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    const input = { marketId: 'mkt_austin', titleEn: 'Welcome to Neighbors', bodyEn: 'Ask who to hire and thank the helpers you booked.', titleEs: 'Bienvenidos a Vecinos', bodyEs: 'Pregunta a quién contratar y agradece a quienes contrataste.', endsDate, reason: 'Launch week welcome for Austin members.' };
    expect(await publishAnnouncement(db, taylor, input, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await publishAnnouncement(db, riley, { ...input, endsDate: '2020-01-01' }, now)).toMatchObject({ ok: false, fieldErrors: { endsDate: ['out_of_range'] } });
    expect(await publishAnnouncement(db, riley, input, now)).toMatchObject({ ok: true });
    cleanups.push(() => db.delete(communityAnnouncements).where(eq(communityAnnouncements.createdByUserId, 'usr_riley')));
    const card = await announcementFor(db, 'usr_maya', 'mkt_austin', 'es', now);
    expect(card).toMatchObject({ title: 'Bienvenidos a Vecinos' });
    expect(await dismissAnnouncement(db, 'usr_maya', card!.id, now)).toMatchObject({ ok: true });
    expect(await announcementFor(db, 'usr_maya', 'mkt_austin', 'en', now)).toBeUndefined();
    expect(await announcementFor(db, 'usr_ben', 'mkt_austin', 'en', now)).toMatchObject({ title: 'Welcome to Neighbors' });
    expect((await adminAnnouncements(db, now)).find((row) => row.id === card!.id)).toMatchObject({ state: 'live', dismissals: 1 });
    expect(await endAnnouncement(db, riley, { id: card!.id, reason: 'Launch week is over now.' }, now)).toMatchObject({ ok: true });
    expect(await announcementFor(db, 'usr_ben', 'mkt_austin', 'en', now)).toBeUndefined();
  });
});

describe('the home card, the nav dot, the digest and metrics (plan 10.14, 10.19, 10.22)', () => {
  it('shows the newest posts near the person, never their own', async () => {
    const title = `Home card ${unique()}`;
    // Citywide, so it's near Maya wherever the seed puts her and Chris.
    await post(chris, { title, areaSlug: '' });
    const card = await neighborsCard(db, maya, now);
    expect(card?.posts.length).toBeGreaterThan(0);
    expect(card?.posts.every((item) => item.authorName !== 'Maya R.')).toBe(true);
    const news = await neighborsNewsOf(db, maya);
    expect(news).toMatchObject({ visitKey: 'portal:austin' });
    expect(Date.parse(news!.latestAt)).toBeGreaterThan(now.getTime() - 60_000);
    // Grace's market has its own news (the test database has no Gainesville posts of its own, so one goes in).
    const gainesvillePost = newId('cpo');
    await db.insert(communityPosts).values({ id: gainesvillePost, marketId: 'mkt_gainesville', authorUserId: 'usr_chris', kind: 'question', title: `Gainesville news ${unique()}`, body: 'Who can help with move-in boxes?', lastActivityAt: now, createdAt: now, updatedAt: now });
    cleanups.push(() => db.delete(communityPosts).where(eq(communityPosts.id, gainesvillePost)));
    expect((await neighborsNewsOf(db, grace))?.visitKey).toBe('portal:gainesville');
  });

  it('sends a week’s digest once, on Sunday morning, to people whose place was busy', async () => {
    // The first Sunday at 16:00 UTC (10 or 11 am in Austin) after these posts, so its week (from that Sunday's 9 am
    // back 7 days) holds them: on a Sunday morning that's today, not next week.
    const sunday = new Date(now);
    sunday.setUTCHours(16, 0, 0, 0);
    while (sunday.getUTCDay() !== 0 || sunday.getTime() <= now.getTime()) sunday.setUTCDate(sunday.getUTCDate() + 1);
    // Citywide, so they're in Maya's place wherever the seed puts her and Chris.
    for (let index = 0; index < 3; index += 1) await post(chris, { title: `Busy week ${index} ${unique()}`, areaSlug: '' });
    // A run takes 200 people a market, longest since a digest first (never comes last): a digest long ago puts Maya
    // first among the test database's many Austin members.
    await db.update(users).set({ communityDigestAt: new Date('2000-01-02T00:00:00.000Z') }).where(eq(users.id, 'usr_maya'));
    // The run reaches every member of the market: its events and marks are removed again, so no other file's
    // dispatch sends these digests.
    cleanups.push(async () => {
      await db.delete(outboxEvents).where(and(eq(outboxEvents.type, 'community.digest'), sql`${outboxEvents.createdAt} >= ${now}`));
      await db.update(users).set({ communityDigestAt: null }).where(or(sql`${users.communityDigestAt} >= ${sunday}`, eq(users.id, 'usr_maya')));
    });
    await runCommunityDigests(db, sunday);
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'community.digest'), eq(outboxEvents.aggregateId, 'usr_maya'), sql`${outboxEvents.id} like ${`evt_cdigest_usr_maya_${'%'}`}`));
    expect(event?.payload).toMatchObject({ userId: 'usr_maya', count: expect.any(Number) });
    const [planned] = await planNotifications(db, event!);
    expect(planned).toMatchObject({ userId: 'usr_maya', type: 'community_digest', target: { kind: 'community' } });
    const [after] = await db.select({ at: users.communityDigestAt }).from(users).where(eq(users.id, 'usr_maya'));
    expect(after?.at?.toISOString()).toBe(sunday.toISOString());
    // Once a week: a later run that Sunday sends nothing new.
    const before = await db.select({ id: outboxEvents.id }).from(outboxEvents).where(and(eq(outboxEvents.type, 'community.digest'), eq(outboxEvents.aggregateId, 'usr_maya')));
    await runCommunityDigests(db, new Date(sunday.getTime() + 3_600_000));
    const again = await db.select({ id: outboxEvents.id }).from(outboxEvents).where(and(eq(outboxEvents.type, 'community.digest'), eq(outboxEvents.aggregateId, 'usr_maya')));
    expect(again).toHaveLength(before.length);
  });

  it('counts the period for staff', async () => {
    const metrics = await communityMetrics(db, new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 60_000), false);
    expect(metrics.posts).toBeGreaterThan(0);
    expect(metrics.asks).toBeGreaterThanOrEqual(metrics.answeredWithinDay);
    expect(metrics.recommendationRequests).toBeGreaterThanOrEqual(metrics.withNamedHelper);
  });
});

describe('any social post (2026-11-22)', () => {
  it('posts general words with no title, names them by their first line, remakes it on an edit, and filters them', async () => {
    const first = `Morning at the lake ${unique()}`;
    const id = await post(maya, { kind: 'general', title: '', body: `${first}\nText me at 512-555-0199 if you want to join.`, areaSlug: '' });
    const [row] = await db.select({ kind: communityPosts.kind, title: communityPosts.title, body: communityPosts.body }).from(communityPosts).where(eq(communityPosts.id, id));
    expect(row).toMatchObject({ kind: 'general', title: first });
    expect(row?.body).not.toContain('512-555-0199');
    // An edit has only the words; the title follows them.
    expect(await editCommunityItem(db, maya, { target: 'post', id, body: 'Evening at the lake instead.\nSame plan.' }, now)).toMatchObject({ ok: true });
    const [edited] = await db.select({ title: communityPosts.title }).from(communityPosts).where(eq(communityPosts.id, id));
    expect(edited?.title).toBe('Evening at the lake instead.');
    // The portal's Posts filter shows only general posts, and counts them.
    const page = await getPortal(db, lee, { area: 'all', type: 'general', sort: 'new' }, now);
    expect(page?.items.some((item) => item.id === id)).toBe(true);
    expect(page?.items.every((item) => item.type === 'post' && item.post.kind === 'general')).toBe(true);
    expect(page?.facets.types.general).toBeGreaterThan(0);
  });

  it('refuses a general post without words, and asks the others for a title', async () => {
    expect(await createCommunityPost(db, maya, { kind: 'general', body: '' }, now)).toMatchObject({ ok: false, fieldErrors: { body: ['required'] } });
    expect(await createCommunityPost(db, maya, { kind: 'question', body: 'Weekend mornings work best for us.' }, now)).toMatchObject({ ok: false, fieldErrors: { title: ['required'] } });
  });
});

describe('cleanup', () => {
  it('leaves no photos without a post', async () => {
    const orphans = await db.select({ fileId: communityPhotos.fileId }).from(communityPhotos).leftJoin(communityPosts, eq(communityPosts.id, communityPhotos.postId)).where(sql`${communityPosts.id} is null`);
    expect(orphans).toEqual([]);
  });
});
