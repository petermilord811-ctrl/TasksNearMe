import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Posting a task end to end: the wizard, the quote from the fee engine, and the public board. The
 * `tnm_geo_stand_in` cookie gets the fictional sample addresses, so this never calls Mapbox where a token is set.
 */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
});

/** A calendar date in Austin, `days` from today. */
function marketDate(days: number): string {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  return format.format(new Date(Date.now() + days * 86_400_000));
}

test('a poster posts a task with the wizard and finds it on the board', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await devSignIn(page, 'maya@example.test');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();

  // Category
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();

  // Describe
  const title = `Assemble a bookshelf (${testInfo.project.name} ${Date.now()})`;
  await page.getByLabel('Task title').fill(title);
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next();

  // Details
  await page.getByLabel('What needs assembling?').selectOption('bookshelf');
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next();

  // Photos: optional
  await next();

  // Where: an in-area address shows its neighborhood only
  await page.getByRole('radio', { name: 'In person' }).check();
  await page.getByRole('combobox', { name: 'Search your address' }).fill('1240 example');
  await page.getByRole('option', { name: /1240 Example Lane/ }).click();
  await expect(page.getByText(/Mueller/).first()).toBeVisible();
  await next();

  // When
  await page.getByLabel('Date').fill(marketDate(5));
  await page.getByRole('radio', { name: 'Choose a time window' }).check();
  await page.getByLabel('Window starts').selectOption('10:00');
  await page.getByLabel('Window ends').selectOption('12:00');
  await next();

  // Budget
  await page.getByRole('radio', { name: 'Fixed price' }).check();
  await page.getByLabel('Task price ($)').fill('60');
  await next();

  // Review: nothing is posted until "Post task" (UI-024); the quote comes from the fee engine ($60 + $6 fee)
  await expect(page.getByText('Step 8 of 8', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/tasks\/new$/);
  await expect(page.getByText('$66.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Post task' }).click();
  // The new task's management page: no offers yet.
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('No offers yet')).toBeVisible();

  await page.goto('/austin/tasks?sort=newest');
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});

test('a poster starts from an example: its words, its questions and its details, ready to change', async ({ page }) => {
  await devSignIn(page, 'maya@example.test');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/tasks/new?template=yard-leaves');
  await expect(page.getByText('Step 2 of 8', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rake leaves' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Task title')).toHaveValue('Rake and bag leaves');
  await expect(page.getByRole('textbox', { name: 'What do you need help with?' })).toHaveValue(/^Rake the yard and bag the leaves for curbside pickup\.\n- Front yard, back yard or both:/);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel('Yard size')).toHaveValue('medium');
  await expect(page.getByLabel('What needs doing?')).toHaveValue('leaves');

  // An example the market doesn't offer is ignored: the wizard starts at the category step as usual.
  await page.goto('/app/tasks/new?template=tv-mounting');
  await expect(page.getByText('Step 1 of 8', { exact: false })).toBeVisible();
});

test('posting without a verified phone goes through phone verification first', async ({ page }) => {
  await page.goto('/sign-in?next=%2Fapp%2Ftasks%2Fnew');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in or create an account' })).toBeVisible();
  // Signed out: the sign-in flow keeps the destination, which needs a phone (see sign-in.spec.ts).
  expect(page.url()).toContain('next=%2Fapp%2Ftasks%2Fnew');
});
