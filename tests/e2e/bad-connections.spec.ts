import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { marketDate } from './support/post-task';
import { closeTask, openTask } from './support/scenarios';
import { devSignIn, submitEmailStep } from './support/sign-in';

/**
 * Bad connections on a phone (sweep "Bad connections", 2026-11-21): a session that ends while an offer is being written
 * says so and brings the person back to their words after signing in (J-N2); a post whose answer never arrived, posted
 * again, is one task (J-N1).
 */

test.skip(({ isMobile }) => !isMobile, 'a phone matter; one project is enough');

async function newestCode(context: BrowserContext, to: string): Promise<string | null> {
  const outbox = await context.newPage();
  try {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"][data-tag="sign-in-code"] pre`).first().textContent({ timeout: 5_000 }).catch(() => null);
    return body?.match(/\b(\d{6})\b/)?.[1] ?? null;
  } finally {
    await outbox.close();
  }
}

async function tasksTitled(title: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<{ id: string }>('select id from tasks where title = $1', [title])).rows.map((row) => row.id);
  } finally {
    await client.end();
  }
}

test('signed out while writing an offer: it says so, and signing in comes back to the words (J-N2)', async ({ page, context }) => {
  test.setTimeout(180_000);
  const task = await openTask('signed-out-offer');
  try {
    await devSignIn(page, 'jordan@example.test');
    await page.goto(`/app/find-work/${task.taskId}`);
    const message = page.getByLabel('Message to the client');
    await expect(message).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Task price ($)').fill('70');
    const words = 'I can come Saturday morning with my own drill.';
    await message.fill(words);

    // The session ends before Send offer: its cookies expire (the session token and the cached session data).
    await context.clearCookies({ name: /^better-auth\./ });
    await page.getByRole('button', { name: 'Send offer' }).click();
    // Either the action follows the sign-in redirect straight to sign-in, or it fails in place and says so, with a link
    // to sign in again: both come back to this page afterwards.
    const signedOut = page.getByText("You've been signed out.", { exact: false });
    const signIn = page.getByRole('heading', { level: 1, name: 'Sign in' });
    await expect(signedOut.or(signIn).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    if (await signedOut.isVisible()) await page.getByRole('link', { name: 'Sign in again' }).click();
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(`/app/find-work/${task.taskId}`)}`));

    // The code sent now, not an earlier run's (already used) one.
    const before = await newestCode(context, 'jordan@example.test');
    await submitEmailStep(page, 'jordan@example.test');
    let code: string | null = null;
    await expect.poll(async () => (code = await newestCode(context, 'jordan@example.test')), { timeout: 20_000 }).not.toBe(before);
    await page.locator('input[autocomplete="one-time-code"]').filter({ visible: true }).first().fill(code!);
    await expect(page).toHaveURL(new RegExp(`/app/find-work/${task.taskId}$`), { timeout: 30_000 });
    await expect(page.getByLabel('Message to the client')).toHaveValue(words, { timeout: 30_000 });
  } finally {
    await closeTask(task.taskId);
  }
});

async function wizardToReview(page: Page, title: string) {
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible({ timeout: 30_000 });
  const next = async (step: string) => {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(step, { exact: false })).toBeVisible({ timeout: 30_000 });
  };
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next('Step 2 of 7');
  await page.getByLabel('Task title').fill(title);
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next('Step 3 of 7');
  await page.getByLabel('What needs assembling?').selectOption('bookshelf');
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next('Step 4 of 7');
  await page.getByRole('radio', { name: 'In person' }).check();
  await page.getByRole('combobox', { name: 'Search your address' }).fill('1240 example');
  await page.getByRole('option', { name: /1240 Example Lane/ }).click();
  await next('Step 5 of 7');
  await page.getByLabel('Date').fill(marketDate(5));
  await page.getByRole('radio', { name: 'Choose a time window' }).check();
  await page.getByLabel('Window starts').selectOption('10:00');
  await page.getByLabel('Window ends').selectOption('12:00');
  await next('Step 6 of 7');
  await page.getByRole('radio', { name: 'Fixed price' }).check();
  await page.getByLabel('Task price ($)').fill('60');
  await next('Step 7 of 7');
}

test('a post whose answer never arrived, posted again, is one task (J-N1)', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  await devSignIn(page, 'maya@example.test');
  const title = `Lost answer ${Date.now().toString(36)}`;
  try {
    await wizardToReview(page, title);
    // The server saves the task, but the phone never hears back.
    let armed = true;
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (!armed || request.method() !== 'POST' || !request.headers()['next-action']) return route.fallback();
      armed = false;
      await route.fetch().catch(() => undefined);
      return route.abort('connectionreset');
    });
    await page.getByRole('button', { name: 'Post task' }).click();
    await expect(page.getByText("We couldn't complete that action.", { exact: false })).toBeVisible({ timeout: 30_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    // Posted again from the kept draft: the same task, not a second one.
    await page.getByRole('button', { name: 'Post task' }).click();
    await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
    const posted = await tasksTitled(title);
    expect(posted).toHaveLength(1);
    expect(page.url()).toContain(posted[0]);
  } finally {
    for (const id of await tasksTitled(title)) await closeTask(id);
  }
});
