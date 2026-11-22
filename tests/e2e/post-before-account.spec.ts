import { expect, test, type Page } from '@playwright/test';
import { marketDate } from './support/post-task';
import { closeTask } from './support/scenarios';
import { latestCode } from './support/outbox';

/**
 * The post form before an account (visitor-to-first-post walk, J-V5; ab's checks): a visitor drafts from a service
 * page signed out, and "Post task" asks for the account. The draft waits on the device through sign-up (the sign-in
 * and sign-up pages keep it: their destination carries its code), the phone where texts work and the invite step of
 * a market opening soon, then the app's form opens on its review step with the same words, and it posts.
 */

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();
/** Typing or pressing in the server's HTML before the page hydrates is lost: wait for the marker to clear first. */
const hydrated = (page: Page) => expect(page.locator('[data-hydrating]')).toHaveCount(0, { timeout: 30_000 });

test('a visitor drafts a task before having an account, and its words survive sign-up to post from the review step (J-V5)', async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  const stamp = `${testInfo.project.name === 'app-mobile' ? 'M' : 'D'}${Date.now()}`;
  const title = `Guest bookshelf ${stamp}`;
  // Lower case, as the app stores (and the outbox shows) addresses.
  const email = `e2e-guest-post-${stamp.toLowerCase()}@example.test`;
  let taskId: string | undefined;
  try {
    // A service page's own "Post a task": the form opens signed out, on that service (its words step).
    await page.goto('/gainesville/furniture-assembly');
    await hydrated(page);
    await page.getByRole('main').getByRole('link', { name: 'Post a task' }).first().click();
    // Each step is a history entry: the address gains its step once the form is ready.
    await expect(page).toHaveURL(/\/post\?category=furniture-assembly(&step=describe)?$/, { timeout: 30_000 });
    await expect(page.getByText('Step 2 of 7', { exact: false }).filter({ visible: true })).toBeVisible();
    await hydrated(page);
    await page.getByLabel('Task title').fill(title);
    await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
    // Photos wait for the account.
    await expect(page.getByText("You can add photos once you've created your account, before you post.")).toBeVisible();
    await next(page);
    await page.getByLabel('What needs assembling?').selectOption('bookshelf');
    await page.getByLabel('Number of items', { exact: true }).fill('1');
    await next(page);
    await page.getByRole('radio', { name: 'In person' }).check();
    await page.getByRole('combobox', { name: 'Search your address' }).fill('2201 example');
    await page.getByRole('option', { name: /2201 Example Lane/ }).click();
    await next(page);
    await page.getByLabel('Date').fill(marketDate(5));
    await page.getByRole('radio', { name: 'Choose a time window' }).check();
    await page.getByLabel('Window starts').selectOption('10:00');
    await page.getByLabel('Window ends').selectOption('12:00');
    await next(page);
    await page.getByRole('radio', { name: 'Fixed price' }).check();
    await page.getByLabel('Task price ($)').fill('60');
    await next(page);
    await expect(page.getByText('Step 7 of 7', { exact: false }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Next, create your account or sign in.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Post task' }).click();

    // The account: sign-up, with the app's form (and the draft's code) as its destination.
    await expect(page).toHaveURL(/\/sign-up\?next=%2Fapp%2Ftasks%2Fnew%3Fhandoff%3D[0-9a-f-]{36}$/, { timeout: 30_000 });
    await hydrated(page);
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Create account', exact: true }) });
    await form.getByLabel('First name').fill('Gia');
    await form.getByLabel('Last name').fill('Hart');
    await form.getByLabel('Email', { exact: true }).fill(email);
    await form.getByLabel(/18 or older/).check();
    await form.getByLabel(/I agree to the Terms of service/).check();
    await form.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('6-digit code').fill(await latestCode(context, email));
    // The phone, where texts work (inside sign-up, as posting needs it).
    const phoneHeading = page.getByRole('heading', { level: 1, name: 'Add your phone number' });
    const opensSoon = page.getByRole('heading', { level: 1, name: 'Gainesville opens soon' });
    await expect(phoneHeading.or(opensSoon)).toBeVisible({ timeout: 30_000 });
    if (await phoneHeading.isVisible()) {
      const line = String(1000 + (Date.now() % 9000));
      await page.getByLabel('Phone number').fill(`(352) 555-${line}`);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.locator('input[autocomplete="one-time-code"]').filter({ visible: true }).first().fill(await latestCode(context, `+1352555${line}`));
    }
    // Gainesville opens soon: the test world's client code (J-V8).
    await expect(opensSoon).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await page.getByLabel('Invite code').fill('SPECCLIENT');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    // The same words, on the review step, ready to post.
    await expect(page.getByText('Step 7 of 7', { exact: false }).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    // The visible one: the router keeps hidden copies of screens it showed before.
    await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();
    await hydrated(page);
    await page.getByRole('button', { name: 'Post task' }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
    taskId = page.url().match(/(tsk_[0-9a-f]+)$/)?.[1];
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  } finally {
    if (taskId) await closeTask(taskId);
  }
});
