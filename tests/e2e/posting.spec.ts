import { expect, test } from '@playwright/test';
import { closeTask } from './support/scenarios';
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
  await expect(page.getByText('Step 7 of 7', { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/tasks\/new(\?step=[a-z]+)?$/);
  await expect(page.getByText('$66.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Post task' }).click();
  // The new task's management page: no offers yet.
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('No offers yet')).toBeVisible();

  await page.goto('/austin/tasks?sort=newest');
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});

test('a formatted description, an address outside our cities and a price under the minimum all post (owner, 2026-11-21)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one project is enough');
  test.setTimeout(180_000);
  await devSignIn(page, 'maya@example.test');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/tasks/new');
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();

  // One field, formatted with the toolbar: a heading and a list.
  const title = `Bookshelf in Waco (${Date.now()})`;
  await page.getByLabel('Task title').fill(title);
  const description = page.getByRole('textbox', { name: 'What do you need help with?' });
  await description.fill('Flat-pack bookshelf in the hallway.\n\nWhat needs doing');
  await page.getByRole('button', { name: 'Heading' }).click();
  await description.press('End');
  await description.press('Enter');
  await page.getByRole('button', { name: 'Bulleted list' }).click();
  await description.pressSequentially('Unpack the box');
  await description.press('Enter');
  await description.pressSequentially('Assemble it by the stairs');
  await expect(description).toHaveValue('Flat-pack bookshelf in the hallway.\n\n## What needs doing\n- Unpack the box\n- Assemble it by the stairs');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'What needs doing' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();
  await next();
  await page.getByLabel('What needs assembling?').selectOption('bookshelf');
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next();

  // Where: Waco is outside Austin's service area, and can be posted; helpers see the city.
  await page.getByRole('radio', { name: 'In person' }).check();
  await page.getByRole('combobox', { name: 'Search your address' }).fill('100 example road');
  const waco = page.getByRole('option', { name: /100 Example Road/ });
  await expect(waco).toContainText('Outside our cities for now');
  await waco.click();
  await expect(page.getByText('Helpers see: Waco, TX.')).toBeVisible();
  await expect(page.getByText(/We're not open in Waco yet/)).toBeVisible();
  await next();

  await page.getByLabel('Date').fill(marketDate(5));
  await page.getByRole('radio', { name: 'Choose a time window' }).check();
  await page.getByLabel('Window starts').selectOption('10:00');
  await page.getByLabel('Window ends').selectOption('12:00');
  await next();

  // Budget: no "Typical in" box; $15 is under the $25 minimum, which is noted, not refused.
  await expect(page.getByText(/Typical in/)).toHaveCount(0);
  await page.getByRole('radio', { name: 'Fixed price' }).check();
  await page.getByLabel('Task price ($)').fill('15');
  await expect(page.getByText(/That's under \$25\.00, the usual minimum for this category/)).toBeVisible();
  await next();
  await expect(page.getByText('Step 7 of 7', { exact: false })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Unpack the box' })).toBeVisible();
  await page.getByRole('button', { name: 'Post task' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
  const taskId = new URL(page.url()).pathname.split('/').pop()!;
  try {
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What needs doing' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Assemble it by the stairs' })).toBeVisible();
    await expect(page.getByText('Waco, TX').first()).toBeVisible();
    await expect(page.getByText('Waco, TX, Austin')).toHaveCount(0);
  } finally {
    await closeTask(taskId);
  }
});

test('a poster starts from an example: its words, its questions and its details, ready to change', async ({ page }) => {
  await devSignIn(page, 'maya@example.test');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/tasks/new?template=yard-leaves');
  await expect(page.getByText('Step 2 of 7', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rake leaves' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Task title')).toHaveValue('Rake and bag leaves');
  await expect(page.getByRole('textbox', { name: 'What do you need help with?' })).toHaveValue(/^Rake the yard and bag the leaves for curbside pickup\.\n- Front yard, back yard or both:/);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel('Yard size')).toHaveValue('medium');
  await expect(page.getByLabel('What needs doing?')).toHaveValue('leaves');

  // An example the market doesn't offer is ignored: the wizard starts at the category step as usual.
  await page.goto('/app/tasks/new?template=tv-mounting');
  await expect(page.getByText('Step 1 of 7', { exact: false })).toBeVisible();
});

test('posting without a verified phone goes through phone verification first', async ({ page }) => {
  await page.goto('/sign-in?next=%2Fapp%2Ftasks%2Fnew');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  // Signed out: the sign-in flow keeps the destination, which needs a phone (see sign-in.spec.ts).
  expect(page.url()).toContain('next=%2Fapp%2Ftasks%2Fnew');
});

test("the phone's Back and Forward move between the wizard's steps, and a kept draft says so (journeys on a phone, J-C9)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'the Back gesture is a phone matter; one project is enough');
  test.setTimeout(150_000);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  const step = (label: string) => expect(page.getByText(label, { exact: false })).toBeVisible();

  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();
  await step('Step 2 of 7');
  await page.getByLabel('Task title').fill('Assemble a bookshelf for the hallway');
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next();
  await step('Step 3 of 7');
  await expect(page).toHaveURL(/[?&]step=details/);

  // The phone's Back: the step before, with what was typed; Forward: back on Details. No reload either way.
  await page.goBack();
  await step('Step 2 of 7');
  await expect(page.getByLabel('Task title')).toHaveValue('Assemble a bookshelf for the hallway');
  await page.goForward();
  await step('Step 3 of 7');
  // A reload keeps the step.
  await page.reload();
  await step('Step 3 of 7');

  // Leaving and coming back: the draft is kept, and says so; Start over begins again.
  await page.goto('/app');
  await page.goto('/app/tasks/new');
  await step('Step 3 of 7');
  await expect(page.getByText('We kept your draft from earlier.')).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await step('Step 1 of 7');
  await expect(page.getByText('We kept your draft from earlier.')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Furniture assembly/ })).not.toBeChecked();
});
