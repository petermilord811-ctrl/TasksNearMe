import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { betaAccess } from '../../src/modules/beta/schema';
import { identityVerifications } from '../../src/modules/verification/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn, untilShown } from './support/sign-in';

/**
 * Peeks (2026-11-23, owner: "I hate redirect … you have to show new window for showing helper profile instead of
 * redirect … From the help center 'What to pay for a task near you' button"): on signed-in pages a helper's profile, a
 * help article and the help center open in a sheet over the page instead of leaving it, and a request that needs an ID
 * check says so in its dialog, with the check in a new tab.
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

/**
 * Clicks a link until its peek opens. A click before the page has hydrated follows the link, as it would for anyone that
 * early, so it goes back to `path` (the path and query the test started on) and tries again.
 */
async function openPeek(page: Page, path: string, link: Locator, sheet: Locator) {
  await expect(async () => {
    if (await sheet.isVisible()) return;
    const at = new URL(page.url());
    if (`${at.pathname}${at.search}` !== path) await page.goto(path);
    await link.click({ timeout: 10_000 });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 120_000 });
}

async function standIn(context: BrowserContext, baseURL: string | undefined) {
  // The models' stand-ins, never a real model in tests.
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
}

test('a helper’s profile opens in a sheet over Find helpers, with Request over the page and the full profile in a new tab', async ({ page }) => {
  test.setTimeout(150_000);
  await devSignIn(page, 'chris@example.test');
  await page.goto('/app/helpers?category=computer-help');
  await expect(page.getByRole('heading', { level: 1, name: 'Find helpers' })).toBeVisible({ timeout: 30_000 });
  const sheet = page.getByRole('dialog', { name: 'Lee M.' });
  await openPeek(page, '/app/helpers?category=computer-help', page.getByRole('link', { name: 'Lee M.', exact: true }).first(), sheet);
  // The page stays where it was.
  await expect(page).toHaveURL(/\/app\/helpers\?category=computer-help$/);
  await expect(sheet.getByRole('link', { name: 'Open full profile' })).toHaveAttribute('target', '_blank');
  await expect(sheet.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('href', '/helpers/lee-m');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Request: the request dialog over the page, from the sheet.
  await page.getByRole('link', { name: 'Lee M.', exact: true }).first().click();
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole('button', { name: 'Request Lee M.' }).click();
  await expect(page.getByRole('dialog', { name: 'Ask Lee M. to help' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/helpers\/lee-m\/request$/);
});

test('a help article from the assistant’s answer opens in the sheet, and the help center beside it, with Back', async ({ page, context, baseURL }) => {
  test.setTimeout(150_000);
  await standIn(context, baseURL);
  await devSignIn(page, 'chris@example.test');
  await page.goto('/app/messages/help');
  const question = page.getByRole('textbox', { name: 'Your question' });
  await expect(question).toBeVisible({ timeout: 30_000 });
  await question.fill('When am I charged?');
  // Send, not Enter: on phones Enter is a new line.
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const source = page.getByRole('log').getByRole('link', { name: 'When am I charged?' }).first();
  await expect(source).toBeVisible({ timeout: 30_000 });
  await source.click();
  const sheet = page.getByRole('dialog', { name: 'When am I charged?' });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/messages\/help$/);
  // A related article opens in the same sheet; Back returns.
  const related = sheet.getByRole('region', { name: 'Related articles' }).getByRole('button').first();
  const relatedTitle = (await related.locator('span').first().textContent())?.trim() ?? '';
  await related.click();
  await expect(page.getByRole('dialog', { name: relatedTitle })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(sheet).toBeVisible({ timeout: 30_000 });
});

test('in the chat window, an answer’s source opens beside the window, which stays open and in use', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'the chat window is for wide screens; phones open the Messages page');
  test.setTimeout(150_000);
  await standIn(context, baseURL);
  await devSignIn(page, 'chris@example.test');
  const box = page.getByRole('dialog', { name: 'Messages' });
  await untilShown(box, () => page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ }).click({ timeout: 5_000 }));
  await box.getByRole('link', { name: /TasksNearMe Help/ }).click();
  const question = box.getByRole('textbox', { name: 'Your question' });
  await expect(question).toBeVisible({ timeout: 30_000 });
  await question.fill('When am I charged?');
  await question.press('Enter');
  const source = box.getByRole('log').getByRole('link', { name: 'When am I charged?' }).last();
  await expect(source).toBeVisible({ timeout: 30_000 });
  await source.click();
  const sheet = page.getByRole('dialog', { name: 'When am I charged?' });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  // On the left, clear of the window; typing in the window leaves the sheet open.
  await expect(box).toBeVisible();
  const [sheetBox, windowBox] = [await sheet.boundingBox(), await box.boundingBox()];
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(windowBox!.x + 1);
  await question.fill('Thanks');
  await expect(sheet).toBeVisible();
  await expect(question).toHaveValue('Thanks');
});

test('a policy’s page opens another policy beside it, and the help center an article, without signing in', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/legal/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible({ timeout: 30_000 });
  const other = page.getByRole('region', { name: 'Other policies' }).getByRole('link').first();
  const title = (await other.textContent())?.trim() ?? '';
  expect(title).not.toBe('');
  const policy = page.getByRole('dialog', { name: title });
  await openPeek(page, '/legal/terms', other, policy);
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(policy.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Escape');
  await expect(policy).toHaveCount(0);

  // The help center: the owner's example, an article beside the list.
  await page.goto('/help');
  const article = page.getByRole('dialog', { name: 'What to pay for a task near you' });
  await openPeek(page, '/help', page.getByRole('link', { name: 'What to pay for a task near you' }).first(), article);
  await expect(page).toHaveURL(/\/help$/);
  await expect(article.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('href', '/help/what-to-pay-for-a-task');
});

test('a request that needs an ID check says so in its dialog, with the check in a new tab, instead of leaving the page', async ({ page }) => {
  test.setTimeout(150_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const person = { id: `usr_e2e_peek_${run}`, email: `e2e-peek-${run}@example.test` };
  const { db, pool } = database();
  try {
    const [ana] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
    if (!ana) throw new Error('The seeded client Ana is missing');
    await db.insert(users).values({ ...ana, id: person.id, email: person.email, name: 'Ida P.', firstName: 'Ida', lastName: 'Park', phone: `+1512555${String(Date.now() % 10_000).padStart(4, '0')}` });
    await db.insert(betaAccess).values({ userId: person.id, marketId: ana.homeMarketId, role: 'poster' }).onConflictDoNothing();
    await db.insert(identityVerifications).values({ id: `idv_e2e_peek_${run}`, userId: person.id, provider: 'dev', providerSessionId: null, status: 'not_started', requestedReason: 'staff_request', createdAt: new Date(), updatedAt: new Date() });

    await devSignIn(page, person.email);
    await page.goto('/helpers/sam-k');
    await expect(page.getByRole('heading', { level: 1, name: 'Sam K.' })).toBeVisible({ timeout: 30_000 });
    // The request opens as a dialog over the profile once the page has hydrated (before, the link leads to its page).
    const dialog = page.getByRole('dialog', { name: 'Verify your identity first' });
    await expect(async () => {
      if (await dialog.isVisible()) return;
      if (!/\/helpers\/sam-k$/.test(page.url())) await page.goto('/helpers/sam-k');
      await page.getByRole('link', { name: 'Request Sam K.' }).filter({ visible: true }).first().click({ timeout: 10_000 });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });
    await expect(page).toHaveURL(/\/app\/helpers\/sam-k\/request$/);
    const verify = dialog.getByRole('link', { name: 'Verify in a new tab' });
    await expect(verify).toHaveAttribute('target', '_blank');
    await expect(verify).toHaveAttribute('href', /\/app\/verify-identity\?next=%2Fapp%2Fhelpers%2Fsam-k%2Frequest/);
    // Not done yet: it says so, and stays.
    await dialog.getByRole('button', { name: "I've finished" }).click();
    await expect(dialog.getByText(/We haven't received your verification yet/)).toBeVisible({ timeout: 30_000 });
  } finally {
    await db.delete(identityVerifications).where(eq(identityVerifications.userId, person.id));
    await db.delete(betaAccess).where(eq(betaAccess.userId, person.id));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, [person.id]));
    await pool.end();
  }
});
