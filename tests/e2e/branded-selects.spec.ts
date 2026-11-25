import { expect, test, type Locator } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Dropdowns open the app's own list, not the browser's (owner, 2026-11-25: "dropdown item is classic one, you didn't
 * customize"). In Chromium a select stays a native select and its list is styled through `appearance: base-select`
 * (src/ui/components/forms/select-menus.css); choosing from that list works as the browser's did: a sort re-sorts,
 * and a form takes the value. Elsewhere a script draws the same list (select-menu-engine.ts, unit-tested).
 */

/** The select and its list are in the app's look: rounded, the popover's shadow. */
async function expectBranded(select: Locator) {
  const look = await select.evaluate((element) => {
    const picker = getComputedStyle(element, '::picker(select)');
    return { appearance: getComputedStyle(element).appearance, picker: picker.appearance, radius: picker.borderTopLeftRadius, shadow: picker.boxShadow };
  });
  expect(look).toMatchObject({ appearance: 'base-select', picker: 'base-select', radius: '16px' });
  expect(look.shadow).not.toBe('none');
}

const isOpen = (select: Locator) => select.evaluate((element) => element.matches(':open'));

test('Find work’s sort opens the app’s list, and a choice from it re-sorts', async ({ page }) => {
  test.setTimeout(120_000);
  await devSignIn(page, 'sam@example.test');
  await page.goto('/app/find-work');
  const sort = page.getByRole('combobox', { name: /^Sort/ });
  await expect(sort).toBeVisible({ timeout: 30_000 });
  await expectBranded(sort);
  await sort.click();
  await expect.poll(() => isOpen(sort), { timeout: 15_000 }).toBe(true);
  await page.getByRole('option', { name: 'Newest', exact: true }).click();
  await expect(page).toHaveURL(/[?&]sort=newest/, { timeout: 30_000 });
  await expect(page.getByRole('combobox', { name: /^Sort/ })).toHaveValue('newest');
});

test('a form’s select (a task’s details) takes a choice from the app’s list', async ({ page, context, baseURL }) => {
  // Sign-in and three wizard pages first (posting.spec.ts takes 180 s for its whole wizard on a cold server).
  test.setTimeout(240_000);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible({ timeout: 30_000 });
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();
  await page.getByLabel('Task title').fill('Assemble a bookshelf (a branded list)');
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next();

  const what = page.getByLabel('What needs assembling?');
  await expect(what).toBeVisible({ timeout: 30_000 });
  await expectBranded(what);
  await what.click();
  await expect.poll(() => isOpen(what), { timeout: 15_000 }).toBe(true);
  await page.getByRole('option', { name: 'Bookshelf', exact: true }).click({ timeout: 15_000 });
  await expect.poll(() => isOpen(what), { timeout: 15_000 }).toBe(false);
  await expect(what).toHaveValue('bookshelf');
  // The form took it (react-hook-form): the step goes on, with no "choose an option".
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next();
  await expect(page.getByRole('radio', { name: 'In person' })).toBeVisible({ timeout: 30_000 });
});
