import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { upsertPeople } from '../../db/seeds/seed';
import { communityPosts, communityReactions, communityReplies } from '../../src/modules/community/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { createDb } from '../../src/platform/db/connect';
import { freshHelper, retireFreshHelper, type FreshHelper } from './support/fresh-helper';
import { devSignIn } from './support/sign-in';

/**
 * Helpers answer on Neighbors and the welcome for new movers (2026-11-24, owner: "implement others all one by one"):
 * a question that picks a service says the helpers who do it will hear about it; a helper's answers neighbors marked
 * Helpful show on their profile and in its peek; and a neighbor who picks their neighborhood is welcomed there once,
 * until "Got it". Rows are this spec's own (prefixed ids, a fresh neighbor and a fresh helper), removed at the end.
 */

const PREFIX = 'cpo_e2e_help_';
const created: string[] = [];

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

/** A neighbor of this spec's own: Ana's copy (an account months old) with no neighborhood, task or helper profile. */
async function freshNeighbor(): Promise<string> {
  const ana = PEOPLE.find((person) => person.id === 'usr_ana');
  if (!ana) throw new Error('Seeded Ana is missing');
  const token = randomUUID().replaceAll('-', '').slice(0, 8);
  const person: SeedPerson = { ...ana, id: `usr_e2e_help_${token}`, email: `mover-${token}@example.test`, lastName: `Sample${token}`, phone: `+1512555${randomInt(3000, 10_000)}` };
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await upsertPeople(tx, [person]);
    });
  } finally {
    await pool.end();
  }
  return person.email;
}

test.afterAll(async () => {
  if (created.length === 0) return;
  const { db, pool } = database();
  try {
    const replies = await db.select({ id: communityReplies.id }).from(communityReplies).where(inArray(communityReplies.postId, created));
    if (replies.length > 0) await db.delete(communityReactions).where(inArray(communityReactions.targetId, replies.map((reply) => reply.id)));
    await db.delete(communityPosts).where(inArray(communityPosts.id, created));
  } finally {
    await pool.end();
  }
});

test('a neighbor who picks their neighborhood is welcomed there once, and "Got it" closes it for good', async ({ page }) => {
  test.setTimeout(150_000);
  await devSignIn(page, await freshNeighbor());
  await page.goto('/app/community');
  const prompt = page.getByRole('region', { name: 'Which neighborhood are you in?' });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  // An account months old that hasn't moved: no welcome.
  await expect(page.getByRole('region', { name: /^Welcome to / })).toHaveCount(0);
  await prompt.getByLabel('Your neighborhood').selectOption({ label: 'Hyde Park' });
  await prompt.getByRole('button', { name: 'Save' }).click();
  const welcome = page.getByRole('region', { name: 'Welcome to Hyde Park' }).filter({ visible: true });
  await expect(welcome).toBeVisible({ timeout: 15_000 });
  // A question opens the new-post form for a question (a dialog over the page).
  await expect(welcome.getByRole('link', { name: 'Ask a question' })).toHaveAttribute('href', /\/app\/community\/new\?kind=question$/);
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('region', { name: /^Welcome to / })).toHaveCount(0, { timeout: 15_000 });
  // Kept on the server: not back on the next visit.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Start a post' }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: /^Welcome to / })).toHaveCount(0);
});

test('a question that picks a service says the helpers who do it hear about it', async ({ page }) => {
  test.setTimeout(90_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/community/new?kind=question');
  const service = page.getByRole('combobox', { name: 'Service' }).filter({ visible: true });
  await expect(service).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Pick a service to ask the helpers who do it too.').filter({ visible: true })).toBeVisible();
  await service.selectOption({ label: 'Moving help' });
  await expect(page.getByText('Moving help: helpers nearby who do it hear about your post and can answer.').filter({ visible: true })).toBeVisible();
});

test('a helper’s answers that neighbors marked helpful show on their profile and in its peek', async ({ page }) => {
  test.setTimeout(120_000);
  let helper: FreshHelper | undefined;
  const title = `Is it worth anchoring a short dresser? ${Date.now().toString(36)}`;
  try {
    helper = await freshHelper();
    const { db, pool } = database();
    try {
      // A live profile, one answer two neighbors marked Helpful.
      await db.update(helperProfiles).set({ status: 'active' }).where(eq(helperProfiles.userId, helper.id));
      const postId = `${PREFIX}${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
      created.push(postId);
      const at = new Date();
      await db.insert(communityPosts).values({ id: postId, marketId: 'mkt_austin', areaId: 'area_mueller', authorUserId: 'usr_maya', kind: 'question', title, body: '', lastActivityAt: at, createdAt: at, updatedAt: at });
      const replyId = `crp_e2e_help_${randomUUID().slice(0, 8)}`;
      await db.insert(communityReplies).values({ id: replyId, postId, authorUserId: helper.id, body: 'Yes: a strap kit costs a few dollars and takes ten minutes. Screw it into a stud.', createdAt: at, updatedAt: at });
      await db.insert(communityReactions).values(['usr_ben', 'usr_chris'].map((userId) => ({ targetKind: 'reply', targetId: replyId, userId, kind: 'helpful' })));
    } finally {
      await pool.end();
    }

    await page.goto(`/helpers/${helper.handle}`);
    await expect(page.getByText('Helped 1 neighbor on Neighbors')).toBeVisible({ timeout: 30_000 });
    const answers = page.getByRole('region', { name: 'Answers on Neighbors' });
    await expect(answers.getByText(title)).toBeVisible();
    await expect(answers.getByText('Asked in Mueller')).toBeVisible();
    await expect(answers.getByText('2 found it helpful')).toBeVisible();

    // The peek reads the same profile.
    await devSignIn(page, 'maya@example.test');
    const peek = await page.request.get(`/api/peek/helpers/${helper.handle}`);
    expect(peek.ok()).toBe(true);
    const data = (await peek.json()) as { profile: { neighborsAnswers?: { helpedCount: number; answers: { questionTitle: string }[] } } };
    expect(data.profile.neighborsAnswers?.helpedCount).toBe(1);
    expect(data.profile.neighborsAnswers?.answers[0]?.questionTitle).toBe(title);
  } finally {
    if (helper) await retireFreshHelper(helper);
  }
});
