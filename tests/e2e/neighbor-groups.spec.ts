import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { upsertPeople } from '../../db/seeds/seed';
import { users } from '../../src/modules/accounts/schema';
import { neighborGroups } from '../../src/modules/community/schema';
import { notifications } from '../../src/modules/notifications/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * Building and street groups (2026-11-24, owner: "implement others all one by one"): a neighbor in Mueller creates a
 * street group on Neighbors and makes an invite; another Mueller neighbor opens the invite's link, sees which group it
 * is, joins, and reads the first message with its phone number hidden; they reply, and can report a message over the
 * page. Everything happens over Neighbors (dialogs and the group's sheet), never on another page. Both people are
 * copies of seeded Maya and Ben made for this run; their groups and notifications go in finally.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  return createDb(url, { max: 1 });
}

interface Cast { token: string; admin: SeedPerson; joiner: SeedPerson }

async function makeCast(): Promise<Cast> {
  const maya = PEOPLE.find((person) => person.id === 'usr_maya');
  const ben = PEOPLE.find((person) => person.id === 'usr_ben');
  if (!maya || !ben) throw new Error('Seeded Maya or Ben is missing');
  const token = randomUUID().replaceAll('-', '').slice(0, 8);
  const copy = (person: SeedPerson, role: string): SeedPerson => ({
    ...person,
    id: `usr_e2e_ngrp_${role}_${token}`,
    email: `ngrp-${role}-${token}@example.test`,
    lastName: `Sample${token}`,
    phone: `+1512555${randomInt(3000, 10_000)}`,
    homeMarketId: 'mkt_austin',
  });
  const admin = copy(maya, 'a');
  const joiner = copy(ben, 'j');
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await upsertPeople(tx, [admin, joiner]);
      // Both live in Mueller: a group is for one neighborhood.
      await tx.update(users).set({ homeAreaId: 'area_mueller', homeMarketId: 'mkt_austin' }).where(inArray(users.id, [admin.id, joiner.id]));
    });
  } finally {
    await pool.end();
  }
  return { token, admin, joiner };
}

/** The run's groups go (their members, invites and messages with them), and the notifications about them. */
async function retire(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    await db.delete(neighborGroups).where(inArray(neighborGroups.createdByUserId, [cast.admin.id, cast.joiner.id]));
    await db.delete(notifications).where(and(inArray(notifications.userId, [cast.admin.id, cast.joiner.id]), eq(notifications.type, 'group_message')));
  } finally {
    await pool.end();
  }
}

async function openNeighbors(page: Page) {
  await page.goto('/app/community');
  await expect(page.getByRole('heading', { name: 'Your groups' })).toBeVisible({ timeout: 30_000 });
}

test('a neighbor starts a street group, invites a neighbor by link, and they talk with contact details hidden', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  const phone = testInfo.project.name === 'app-mobile';
  const cast = await makeCast();
  const groupName = `Aldrich St ${cast.token}`;
  const joinerContext = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL! });
  const joinerPage = await joinerContext.newPage();
  try {
    // The admin creates a street group in her neighborhood, over Neighbors.
    await devSignIn(page, cast.admin.email);
    await openNeighbors(page);
    const start = page.url();
    await page.getByRole('button', { name: 'Create a group' }).click();
    const create = page.getByRole('dialog', { name: 'Create a group' });
    await expect(create.getByText(/in Mueller/)).toBeVisible();
    await create.getByLabel('Group name').fill(groupName);
    await create.getByText('A street', { exact: true }).click();
    await create.getByRole('button', { name: 'Create group' }).click();

    // The new group opens on its members, to invite people; the page never changed.
    const sheet = page.getByRole('dialog', { name: groupName });
    await expect(sheet.getByRole('heading', { name: groupName })).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe(new URL(start).pathname);
    await sheet.getByRole('button', { name: 'Make an invite' }).click();
    const codeLine = sheet.getByText(/^Code [A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(codeLine).toBeVisible({ timeout: 20_000 });
    const code = (await codeLine.textContent())!.replace('Code ', '').trim();

    // A first message with a phone number in it.
    await sheet.getByRole('tab', { name: 'Chat' }).click();
    await sheet.getByLabel(`Message to ${groupName}`).fill('Hi street! Text me at 512-555-0147 about the block party.');
    await sheet.getByRole('button', { name: 'Send' }).click();
    await expect(sheet.getByText(/about the block party/)).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText(/512-555/)).toHaveCount(0);

    // The neighbor opens the invite link: the join dialog over Neighbors says which group it is.
    await devSignIn(joinerPage, cast.joiner.email);
    await joinerPage.goto(`/app/community?join=${encodeURIComponent(code)}`);
    const join = joinerPage.getByRole('dialog', { name: 'Join a group' });
    await expect(join.getByText(`You're invited to ${groupName}.`)).toBeVisible({ timeout: 30_000 });
    await expect(join.getByText(/Never your address, phone number or email/)).toBeVisible();
    await join.getByRole('button', { name: 'Join group' }).click();

    // In: the first message reads with its phone number hidden.
    const joined = joinerPage.getByRole('dialog', { name: groupName });
    await expect(joined.getByText(/about the block party/)).toBeVisible({ timeout: 20_000 });
    await expect(joined.getByText(/512-555/)).toHaveCount(0);
    await joined.getByLabel(`Message to ${groupName}`).fill('Count me in!');
    await joined.getByRole('button', { name: 'Send' }).click();
    await expect(joined.getByText('Count me in!')).toBeVisible({ timeout: 20_000 });

    // The admin sees the reply (live, or once she reopens the group).
    await expect(async () => {
      if (!(await sheet.getByText('Count me in!').isVisible())) {
        await page.reload();
        await page.getByRole('button', { name: new RegExp(`^${groupName}`) }).click();
      }
      await expect(page.getByRole('dialog', { name: groupName }).getByText('Count me in!')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    // The neighbor can report the admin's message: the report opens over the page.
    await joined.getByRole('link', { name: /^Report this message from / }).click();
    await expect(joinerPage.getByRole('heading', { name: 'Report a group message' })).toBeVisible({ timeout: 20_000 });
    if (!phone) await expect(joinerPage.getByRole('dialog').filter({ hasText: 'Report a group message' })).toBeVisible();
  } finally {
    await joinerContext.close();
    await retire(cast);
  }
});
