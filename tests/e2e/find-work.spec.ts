import { expect, test, type Page } from '@playwright/test';

/**
 * The helper's side (UI-009): the feed, a task from the helper's view, and offers.
 * Jordan is a bookable helper in East Austin with a 5-mile area; the shelves task is kept free of
 * offers by the e2e setup.
 */

async function devSignIn(page: Page, email: string) {
  await page.goto('/dev/sign-in');
  await page.locator('form', { has: page.locator(`input[name="email"][value="${email}"]`) }).getByRole('button').click();
  await expect(page).toHaveURL(/\/app$/);
}

const card = (page: Page, title: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: title }) });

test('a helper finds a nearby task, sends an offer, and withdraws it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(120_000);
  await devSignIn(page, 'jordan@example.test');

  await page.goto('/app/find-work');
  await expect(page.getByRole('heading', { level: 1, name: 'Find work' })).toBeVisible();
  await expect(card(page, 'Rake and bag front-yard leaves').getByText('Outside your service area')).toBeVisible();
  await expect(card(page, 'Set up a new laptop and move my photos').getByText("You don't offer this service")).toBeVisible();
  await expect(card(page, 'Assemble a desk (flat-pack, 1 item)').getByText('You made an offer')).toBeVisible();

  await card(page, 'Mount two floating shelves').getByRole('link', { name: 'Mount two floating shelves' }).click();
  await expect(page).toHaveURL(/\/app\/find-work\/tsk_shelves$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mount two floating shelves' })).toBeVisible();
  await expect(page.getByText('the wall is drywall')).toBeVisible();
  // The fee engine's numbers for the $50 budget: Jordan earns $45.00.
  await expect(page.getByText('$45.00').first()).toBeVisible();

  await page.getByLabel('Message to the client').fill('I can mount both shelves level, and I bring a stud finder.');
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible();
  await expect(page.getByText('I can mount both shelves level')).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Send offer' })).toBeVisible();

  await page.goto('/app/offers');
  await expect(page.getByRole('heading', { level: 1, name: 'My offers' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' })).toBeVisible();
});

test('people who are not set up as helpers can browse but not offer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'chris@example.test');

  await page.goto('/app/find-work?category=furniture-assembly');
  await expect(page.getByRole('heading', { name: 'Finish setting up to send offers' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Finish setup' }).first()).toHaveAttribute('href', '/app/helper/onboarding/profile');
  await expect(page.getByRole('link', { name: 'Rake and bag front-yard leaves' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mount two floating shelves' }).click();
  await expect(page.getByRole('heading', { name: 'Before you send an offer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send offer' })).toHaveCount(0);
  const html = await page.content();
  for (const secret of ['300 Sample Street', 'Patel']) expect(html).not.toContain(secret);
});
