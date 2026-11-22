import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { communityPosts, communityReplies } from '../../src/modules/community/schema';
import { supportCaseEvents, supportCaseReads, supportCases } from '../../src/modules/support/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * Report buttons on tasks, profiles and reviews (backlog B-059), on the seeded data; and a reported community reply,
 * which staff open from the case.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

async function staffSignIn(page: Page, email: string) {
  await page.context().clearCookies();
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('reporting from a public page asks visitors to sign in first', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await page.goto('/tasks/assemble-a-desk-mueller-7f3k');
  await page.getByRole('link', { name: 'Report this task' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Freport%2Ftask%2Ftsk_desk/, { timeout: 30_000 });
});

test('a helper reports a profile from the public page and goes back to it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'opens a support case; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'lee@example.test');
  await page.goto('/helpers/sam-k');
  await page.getByRole('link', { name: 'Report this profile' }).click();
  await expect(page).toHaveURL(/\/app\/report\/helper\/sam-k$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Report a helper' })).toBeVisible();
  await page.getByRole('radio', { name: 'Something else' }).check();
  await page.getByRole('textbox', { name: 'Details' }).fill('The profile photo shows someone else entirely.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Support will review this.').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/helpers\/sam-k$/, { timeout: 30_000 });

  // Reviews have their own link.
  await expect(page.getByRole('link', { name: /^Report this review by / }).first()).toBeVisible();
});

test('a reported community reply: staff open it in its thread from the case', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'opens a support case; desktop only');
  test.setTimeout(180_000);
  // Maya asks the community; Ben's reply asks for money outside the app. Posts and replies have no staff page.
  const stamp = Date.now().toString(36);
  const [postId, replyId] = [`cpo_e2e_report_${stamp}`, `cre_e2e_report_${stamp}`];
  const { db, pool } = database();
  try {
    await db.insert(communityPosts).values({ id: postId, marketId: 'mkt_austin', authorUserId: 'usr_maya', kind: 'question', title: `Who can fix a squeaky door? ${stamp}`, body: 'Our front door squeaks every time it opens.' });
    await db.insert(communityReplies).values({ id: replyId, postId, authorUserId: 'usr_ben', body: 'Send me $20 by Venmo first and I will come by.' });

    await devSignIn(page, 'maya@example.test');
    await page.goto(`/app/report/reply/${replyId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Report a reply' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('radio', { name: 'Something else' }).check();
    await page.getByRole('textbox', { name: 'Details' }).fill('He asks for money by Venmo before coming.');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Thanks. Support will review this.').first()).toBeVisible({ timeout: 30_000 });
    const reported = (await db.select({ id: supportCases.id, context: supportCases.context }).from(supportCases).where(eq(supportCases.openedByUserId, 'usr_maya'))).find((row) => row.context?.replyId === replyId);
    expect(reported, 'the report opened a case about the reply').toBeDefined();

    // A support lead opens the case, then the reply in its thread, where its ⋮ menu moderates it.
    await staffSignIn(page, 'morgan@example.test');
    await page.goto(`/admin/cases/${reported!.id}`);
    await page.getByRole('link', { name: 'Open the reply' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/community/${postId}#reply-${replyId}$`), { timeout: 30_000 });
    await expect(page.locator(`[id="reply-${replyId}"]`).filter({ visible: true }).getByText('Send me $20 by Venmo first')).toBeVisible();
  } finally {
    const cases = (await db.select({ id: supportCases.id, context: supportCases.context }).from(supportCases).where(eq(supportCases.openedByUserId, 'usr_maya'))).filter((row) => row.context?.replyId === replyId);
    for (const row of cases) {
      await db.delete(supportCaseEvents).where(eq(supportCaseEvents.caseId, row.id));
      await db.delete(supportCaseReads).where(eq(supportCaseReads.caseId, row.id));
      await db.delete(supportCases).where(eq(supportCases.id, row.id));
    }
    // Its replies go with it.
    await db.delete(communityPosts).where(eq(communityPosts.id, postId));
    await pool.end();
  }
});
