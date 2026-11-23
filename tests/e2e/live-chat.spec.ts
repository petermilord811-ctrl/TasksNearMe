import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { usernames, users } from '../../src/modules/accounts/schema';
import { notificationDeliveries, notifications } from '../../src/modules/notifications/schema';
import { supportCaseEvents, supportCaseReads, supportCases } from '../../src/modules/support/schema';
import { auditLog } from '../../src/platform/audit/schema';
import { devOutboxMessages } from '../../src/platform/dev-outbox/schema';
import { createDb } from '../../src/platform/db/connect';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { devSignIn } from './support/sign-in';

/**
 * Live chat with support (2026-11-22, owner: "If I say 'I want to contact live agent' or 'Talk to a real person', let
 * users wait until support is attending to chatting, and I will support chatting (admins)"). A member asks TasksNearMe
 * Help for a person in words and waits in line; Alex from support sees them arrive on the live chat console, joins, and
 * the two write to each other as it happens (each sees the other typing) until Alex ends the chat. On wide screens in
 * the chat window, on phones on the Help page. Each test makes its own member (a copy of Chris with a name no other run
 * has) and removes them, their cases and notifications after.
 */

interface Member {
  id: string;
  email: string;
  name: string;
}

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

async function makeMember(): Promise<Member> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const id = `usr_e2e_live_${run}`;
    const email = `e2e-live-${run}@example.test`;
    // A name only this run has, so the console's rows can't be confused with another project's.
    const name = `Lena ${run.slice(-5).toUpperCase()}`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    if (!chris) throw new Error('Seeded Chris is missing');
    await db.insert(users).values({ ...chris, id, email, name, firstName: 'Lena', lastName: run.slice(-5).toUpperCase(), phone: null, phoneVerifiedAt: null });
    return { id, email, name };
  } finally {
    await pool.end();
  }
}

async function removeMember(member: Member): Promise<void> {
  const { db, pool } = database();
  try {
    const cases = (await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, member.id))).map((row) => row.id);
    // The job runner may still be delivering support's reply: give it a moment, so removing never races the delivery.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    if (cases.length > 0) {
      await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, cases));
      await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, cases));
      await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, cases));
      await db.delete(auditLog).where(inArray(auditLog.targetId, cases));
      await db.delete(supportCases).where(inArray(supportCases.id, cases));
    }
    const own = (await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, member.id))).map((row) => row.id);
    if (own.length > 0) {
      await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, own));
      await db.delete(notifications).where(inArray(notifications.id, own));
    }
    await db.delete(devOutboxMessages).where(eq(devOutboxMessages.to, member.email.toLowerCase()));
    await db.delete(usernames).where(eq(usernames.userId, member.id));
    await db.delete(users).where(eq(users.id, member.id));
  } finally {
    await pool.end();
  }
}

/** The transcript emails the member got (the e2e build's email outbox, 2026-11-23). */
async function transcriptsTo(email: string) {
  const { db, pool } = database();
  try {
    return await db.select().from(devOutboxMessages).where(and(eq(devOutboxMessages.to, email.toLowerCase()), eq(devOutboxMessages.tag, 'support-transcript')));
  } finally {
    await pool.end();
  }
}

async function standIn(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
}

/** Alex from support, signed in on a wide screen with the second step done, on the live chat console. */
async function alexOnTheConsole(browser: Browser, baseURL: string | undefined): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await devSignIn(page, 'alex@example.test', { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
  // The staff menu has Live chat.
  await page.getByRole('navigation').getByRole('link', { name: /^Live chat/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/live$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Live chat' })).toBeVisible();
  return { context, page };
}

/** Alex takes the member's chat from the queue: it arrives without a reload, opens, and Join chat. */
async function alexJoins(staff: Page, member: Member) {
  const row = staff.getByRole('complementary', { name: 'Live chats' }).getByRole('link', { name: new RegExp(member.name) });
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  const chat = staff.getByRole('region', { name: `Live chat with ${member.name}` });
  await expect(chat.getByRole('log').getByText('I want to talk to a real person')).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByText('Join the chat to write to them.')).toBeVisible();
  await chat.getByRole('button', { name: 'Join chat' }).click();
  await expect(chat.getByRole('textbox', { name: 'Your message' })).toBeVisible({ timeout: 30_000 });
  return chat;
}

test.describe('live chat with support', () => {
  test('in the chat window: waiting in line, Alex joins, both write and see each other typing, then Alex ends it', async ({ page, context, browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'app-desktop', 'the chat window is for wide screens');
    test.setTimeout(240_000);
    await standIn(context, baseURL);
    const member = await makeMember();
    const staff = await alexOnTheConsole(browser, baseURL);
    try {
      await devSignIn(page, member.email);
      await page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ }).click();
      const box = page.getByRole('dialog', { name: 'Messages' });
      await box.getByRole('link', { name: /TasksNearMe Help/ }).click();
      const question = box.getByRole('textbox', { name: 'Your question' });
      await question.fill('I want to talk to a real person');
      await question.press('Enter');

      // Connected at once, no form: in line (Alex has the console open, so support is online).
      const log = box.getByRole('log', { name: 'Conversation with TasksNearMe Help' });
      await expect(box.getByRole('status').filter({ hasText: /Connecting you to a person from support\. You're (next|number \d+ in line)\./ })).toBeVisible({ timeout: 45_000 });
      await expect(log.getByText('I want to talk to a real person').first()).toBeVisible();

      const chat = await alexJoins(staff.page, member);
      await expect(log.getByText('Alex from support joined the chat.')).toBeVisible({ timeout: 30_000 });
      await expect(box.getByText('Alex · Support')).toBeVisible();
      await expect(box.getByRole('status').filter({ hasText: /in line/ })).toHaveCount(0);

      // Alex types: the member sees it; Alex sends: it arrives without a reload.
      const reply = chat.getByRole('textbox', { name: 'Your message' });
      await reply.fill('Hi Lena, I');
      await expect(log.getByText('Alex is typing…')).toBeVisible({ timeout: 20_000 });
      await reply.fill('Hi Lena, I’m Alex from support. What happened?');
      await reply.press('Enter');
      await expect(log.getByText('Hi Lena, I’m Alex from support. What happened?')).toBeVisible({ timeout: 30_000 });
      await expect(log.getByText('Alex is typing…')).toHaveCount(0);

      // The member types back: Alex sees it, then the message.
      const message = box.getByRole('textbox', { name: 'Message support' });
      await message.fill('My helper');
      await expect(chat.getByText(`${member.name} is typing…`)).toBeVisible({ timeout: 20_000 });
      await message.fill('My helper never came on Saturday.');
      await message.press('Enter');
      await expect(chat.getByRole('log').getByText('My helper never came on Saturday.')).toBeVisible({ timeout: 30_000 });

      // Alex ends it: the member sees it end, and can still write to support.
      await chat.getByRole('button', { name: 'End chat' }).click();
      await expect(chat.getByText("This chat ended. Reply on the case if there's more to say.")).toBeVisible({ timeout: 30_000 });
      await expect(log.getByText('The live chat ended.', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(log.getByText(/The live chat ended\. You can still write here/)).toBeVisible();
      await expect(message).toBeEditable();
      // They can ask for another.
      await expect(box.getByRole('button', { name: 'Chat live with support' })).toBeVisible();

      // After the chat (2026-11-23): how was it (Alex sees the rating at once), and a copy by email.
      const rating = box.getByRole('region', { name: 'How was your chat with Alex?' });
      await rating.getByRole('button', { name: 'Good' }).click();
      await rating.getByRole('textbox', { name: 'Anything to add? (optional)' }).fill('Quick and kind.');
      await rating.getByRole('button', { name: 'Send' }).click();
      await expect(box.getByText("Thanks! We're glad it helped.")).toBeVisible({ timeout: 30_000 });
      await expect(chat.getByText(`${member.name} rated the help good: “Quick and kind.”`)).toBeVisible({ timeout: 30_000 });
      await box.getByRole('button', { name: 'Email me this conversation' }).click();
      await expect(box.getByText('Sent to e•••@example.test.')).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => (await transcriptsTo(member.email)).length, { timeout: 30_000 }).toBe(1);
      const [copy] = await transcriptsTo(member.email);
      expect(copy!.subject).toMatch(/^Your conversation with TasksNearMe Help: /);
      expect(copy!.body).toContain('Hi Lena, I’m Alex from support. What happened?');
      expect(copy!.body).toContain('My helper never came on Saturday.');
    } finally {
      await staff.context.close();
      await removeMember(member);
    }
  });

  test('on the Help page on a phone: "Talk to a person", in line, Alex joins and writes', async ({ page, context, browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'app-mobile', 'phones open Help as a page');
    test.setTimeout(240_000);
    await standIn(context, baseURL);
    const member = await makeMember();
    const staff = await alexOnTheConsole(browser, baseURL);
    try {
      await devSignIn(page, member.email);
      // Help is in the avatar menu too (owner: "I can't find the help page in other tabs or settings").
      await page.getByRole('button', { name: /account menu for / }).click();
      await page.getByRole('menuitem', { name: 'Help', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/messages\/help$/, { timeout: 30_000 });
      const question = page.getByRole('textbox', { name: 'Your question' });
      await question.fill('I want to talk to a real person');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: /Connecting you to a person from support/ })).toBeVisible({ timeout: 45_000 });

      const chat = await alexJoins(staff.page, member);
      await expect(page.getByText('Alex from support joined the chat.')).toBeVisible({ timeout: 30_000 });
      await chat.getByRole('textbox', { name: 'Your message' }).fill('Hi Lena, Alex here. How can I help?');
      await chat.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByRole('log').getByText('Hi Lena, Alex here. How can I help?')).toBeVisible({ timeout: 30_000 });
      await chat.getByRole('button', { name: 'End chat' }).click();
      await expect(page.getByRole('log').getByText('The live chat ended.', { exact: true })).toBeVisible({ timeout: 30_000 });
      // How was it (2026-11-23): one tap and Send on a phone too; Alex sees it.
      const rating = page.getByRole('region', { name: 'How was your chat with Alex?' });
      await rating.getByRole('button', { name: 'Bad' }).click();
      await rating.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByText("Thanks for telling us. We'll use it to do better.")).toBeVisible({ timeout: 30_000 });
      await expect(chat.getByText(`${member.name} rated the help bad`, { exact: true })).toBeVisible({ timeout: 30_000 });
    } finally {
      await staff.context.close();
      await removeMember(member);
    }
  });
});
