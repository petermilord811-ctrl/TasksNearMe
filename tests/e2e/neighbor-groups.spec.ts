import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { upsertPeople } from '../../db/seeds/seed';
import { users } from '../../src/modules/accounts/schema';
import { neighborGroupMembers, neighborGroups } from '../../src/modules/community/schema';
import { notifications } from '../../src/modules/notifications/schema';
import { files } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { longPress, messageAction, reactTo } from './support/conversation';
import { devSignIn } from './support/sign-in';

/**
 * Building and street groups (2026-11-24, owner: "implement others all one by one"): a neighbor in Mueller creates a
 * street group on Neighbors and makes an invite; another Mueller neighbor opens the invite's link, sees which group it
 * is, joins, and reads the first message with its phone number hidden; they reply, and can report a message over the
 * page. Everything happens over Neighbors (dialogs and the group's sheet), never on another page. Both people are
 * copies of seeded Maya and Ben made for this run; their groups, uploads and notifications go in finally.
 *
 * Then the group's chat as a conversation (2026-11-24, owner: "Group chat feature is not fully implemented yet"):
 * photos that only its members open, a GIF, reactions, a reply that quotes, "typing…" and "New messages".
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

interface Cast { token: string; admin: SeedPerson; joiner: SeedPerson; outsider: SeedPerson }

async function makeCast(): Promise<Cast> {
  const maya = PEOPLE.find((person) => person.id === 'usr_maya');
  const ben = PEOPLE.find((person) => person.id === 'usr_ben');
  const ruth = PEOPLE.find((person) => person.id === 'usr_ruth');
  if (!maya || !ben || !ruth) throw new Error('Seeded Maya, Ben or Ruth is missing');
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
  // A Mueller neighbor who isn't in the group.
  const outsider = copy(ruth, 'o');
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await upsertPeople(tx, [admin, joiner, outsider]);
      // They all live in Mueller: a group is for one neighborhood.
      await tx.update(users).set({ homeAreaId: 'area_mueller', homeMarketId: 'mkt_austin' }).where(inArray(users.id, [admin.id, joiner.id, outsider.id]));
    });
  } finally {
    await pool.end();
  }
  return { token, admin, joiner, outsider };
}

/** A building group of the admin's with the joiner in it, made here (the first test makes one on the page). */
async function makeGroup(cast: Cast, name: string): Promise<string> {
  const { db, pool } = database();
  const id = `ngrp_e2e_${cast.token}`;
  // Both last read it an hour ago: what's written now is new to them.
  const before = new Date(Date.now() - 3_600_000);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(neighborGroups).values({ id, marketId: 'mkt_austin', areaId: 'area_mueller', kind: 'building', name, createdByUserId: cast.admin.id, createdAt: before, updatedAt: before });
      await tx.insert(neighborGroupMembers).values([
        { groupId: id, userId: cast.admin.id, role: 'admin', joinedAt: before, lastReadAt: before },
        { groupId: id, userId: cast.joiner.id, role: 'member', joinedAt: before, lastReadAt: before },
      ]);
    });
  } finally {
    await pool.end();
  }
  return id;
}

/** The run's groups go (their members, invites, messages, photos and reactions with them), its uploads, and the notifications about them. */
async function retire(cast: Cast): Promise<void> {
  const { db, pool } = database();
  const people = [cast.admin.id, cast.joiner.id, cast.outsider.id];
  try {
    await db.delete(neighborGroups).where(inArray(neighborGroups.createdByUserId, people));
    await db.delete(files).where(inArray(files.ownerUserId, people));
    await db.delete(notifications).where(and(inArray(notifications.userId, people), eq(notifications.type, 'group_message')));
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
    await sheet.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(sheet.getByRole('log').getByText(/about the block party/)).toBeVisible({ timeout: 20_000 });
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
    await expect(joined.getByRole('log').getByText(/about the block party/)).toBeVisible({ timeout: 20_000 });
    await expect(joined.getByText(/512-555/)).toHaveCount(0);
    await joined.getByLabel(`Message to ${groupName}`).fill('Count me in!');
    await joined.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(joined.getByRole('log').getByText('Count me in!')).toBeVisible({ timeout: 20_000 });

    // The admin sees the reply (live, or once she reopens the group), in the conversation itself: arriving live, it's also
    // read out ("Ben S.: Count me in!") in the line for screen readers beside it.
    await expect(async () => {
      if (!(await sheet.getByRole('log').getByText('Count me in!').isVisible())) {
        await page.reload();
        await page.getByRole('button', { name: new RegExp(`^${groupName}`) }).click();
      }
      await expect(page.getByRole('dialog', { name: groupName }).getByRole('log').getByText('Count me in!')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    // The neighbor can report the admin's message: the report opens over the page (from the row under the bubble with a
    // mouse, from a long press on a phone).
    const adminsMessage = joined.getByRole('log').locator('li', { hasText: 'about the block party' }).locator('article');
    if (phone) {
      await longPress(adminsMessage);
      await joinerPage.getByRole('dialog', { name: /^Reactions to / }).getByRole('link', { name: /^Report this message from / }).click();
    } else {
      await adminsMessage.hover();
      await adminsMessage.getByRole('link', { name: /^Report this message from / }).click();
    }
    await expect(joinerPage.getByRole('heading', { name: 'Report a group message' })).toBeVisible({ timeout: 20_000 });
    if (!phone) await expect(joinerPage.getByRole('dialog').filter({ hasText: 'Report a group message' })).toBeVisible();
  } finally {
    await joinerContext.close();
    await retire(cast);
  }
});

test('a group chats like a conversation: photos only members open, a GIF, reactions, a reply, "typing…" and "New messages"', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  const cast = await makeCast();
  const groupName = `Lofts ${cast.token}`;
  const groupId = await makeGroup(cast, groupName);
  const contextOf = () => browser.newContext({ ...testInfo.project.use, baseURL: baseURL! });
  const joinerContext = await contextOf();
  const outsiderContext = await contextOf();
  const joinerPage = await joinerContext.newPage();
  const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#7a9a5c' } }).png().toBuffer();
  try {
    // The admin opens the group from its address and sends a photo with a few words, by the paperclip.
    await devSignIn(page, cast.admin.email);
    await page.goto(`/app/community?group=${groupId}`);
    const sheet = page.getByRole('dialog', { name: groupName });
    await expect(sheet.getByRole('log')).toBeVisible({ timeout: 30_000 });
    await sheet.locator('input[type="file"]').setInputFiles({ name: 'package-room.png', mimeType: 'image/png', buffer: photo });
    await expect(sheet.getByRole('list', { name: 'Photos to send' })).toBeVisible({ timeout: 30_000 });
    await sheet.getByLabel(`Message to ${groupName}`).fill('The package room lock is fixed!');
    await sheet.getByRole('button', { name: 'Send', exact: true }).click();
    const sent = sheet.getByRole('log').locator('li', { hasText: 'The package room lock is fixed!' }).locator('article');
    await expect(sent.getByRole('button', { name: /^View photo: / })).toBeVisible({ timeout: 30_000 });
    const src = await sent.getByRole('button', { name: /^View photo: / }).locator('img').getAttribute('src');
    expect(src).toMatch(/^\/api\/files\/fil_/);

    // Members open the photo; a neighbor outside the group can't, even signed in.
    expect((await page.request.get(src!)).status()).toBe(200);
    await devSignIn(joinerPage, cast.joiner.email);
    expect((await joinerContext.request.get(src!)).status()).toBe(200);
    const outsiderPage = await outsiderContext.newPage();
    await devSignIn(outsiderPage, cast.outsider.email);
    expect((await outsiderContext.request.get(src!)).status()).toBe(404);

    // The neighbor opens the group: "New messages" above what came since they last read it, the photo in the bubble.
    await joinerPage.context().addCookies([{ name: 'tnm_gif_stand_in', value: '1', url: baseURL! }]);
    await joinerPage.goto(`/app/community?group=${groupId}`);
    const joined = joinerPage.getByRole('dialog', { name: groupName });
    await expect(joined.getByText('New messages')).toBeVisible({ timeout: 30_000 });
    const theirs = joined.getByRole('log').locator('li', { hasText: 'The package room lock is fixed!' }).locator('article');
    await expect(theirs.getByRole('button', { name: /^View photo: / })).toBeVisible();

    // A heart (the row under the bubble with a mouse, a long press on a phone), then a reply that quotes it.
    await reactTo(theirs, 'Heart');
    await expect(theirs.getByRole('list', { name: 'Reactions' }).getByRole('button', { name: /Heart/ })).toBeVisible({ timeout: 30_000 });
    await messageAction(theirs, 'Reply');
    await expect(joined.getByText(/^Replying to /)).toBeVisible();
    await joined.getByLabel(`Message to ${groupName}`).fill('Thanks for checking!');
    await joined.getByRole('button', { name: 'Send', exact: true }).click();
    const reply = joined.getByRole('log').locator('li', { hasText: 'Thanks for checking!' }).locator('article');
    await expect(reply.locator('blockquote')).toContainText('The package room lock is fixed!', { timeout: 30_000 });

    // The admin's open group shows both, live.
    await expect(sent.getByRole('list', { name: 'Reactions' }).getByRole('button', { name: /Heart/ })).toBeVisible({ timeout: 45_000 });
    await expect(sheet.getByRole('log').locator('li', { hasText: 'Thanks for checking!' }).locator('blockquote')).toBeVisible({ timeout: 45_000 });

    // "typing…": the admin starts a message; the neighbor's header says so.
    await sheet.getByLabel(`Message to ${groupName}`).fill('One more thing about the mail');
    await expect(joined.getByText(/is typing…$/)).toBeVisible({ timeout: 30_000 });

    // A GIF from the neighbor (the samples, never KLIPY): it goes at once and shows animated.
    await joined.getByRole('button', { name: 'Choose a GIF' }).filter({ visible: true }).click();
    const picker = joinerPage.getByRole('dialog', { name: 'GIFs' });
    await expect(picker.getByRole('button', { name: /^Send GIF: / }).first()).toBeVisible({ timeout: 30_000 });
    await picker.getByRole('button', { name: 'Send GIF: Thank you' }).click();
    const gif = joined.getByRole('log').getByRole('img', { name: 'Thank you' });
    await expect(gif).toBeVisible({ timeout: 30_000 });
    const gifSrc = await gif.getAttribute('src');
    const served = await joinerContext.request.get(gifSrc!);
    expect(served.headers()['content-type']).toBe('image/gif');
    expect((await outsiderContext.request.get(gifSrc!)).status()).toBe(404);
  } finally {
    await joinerContext.close();
    await outsiderContext.close();
    await retire(cast);
  }
});
