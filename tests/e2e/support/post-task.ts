import { expect, type Page } from '@playwright/test';

/** A calendar date in Austin, `days` from today. */
export function marketDate(days: number): string {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  return format.format(new Date(Date.now() + days * 86_400_000));
}

/**
 * Posts a furniture-assembly task in Mueller through the wizard, as posting.spec.ts does, for specs that need a
 * fresh task (the signed-in poster needs a verified phone). Needs the `tnm_geo_stand_in` cookie for the address.
 * Ends on the new task's page.
 */
export async function postFurnitureTask(page: Page, title: string, options: { inDays?: number; priceDollars?: number } = {}): Promise<void> {
  const next = () => page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await next();
  await page.getByLabel('Task title').fill(title);
  await page.getByRole('textbox', { name: 'What do you need help with?' }).fill('Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await next();
  await page.getByLabel('What needs assembling?').selectOption('bookshelf');
  await page.getByLabel('Number of items', { exact: true }).fill('1');
  await next();
  await page.getByRole('radio', { name: 'In person' }).check();
  await page.getByRole('combobox', { name: 'Search your address' }).fill('1240 example');
  await page.getByRole('option', { name: /1240 Example Lane/ }).click();
  await expect(page.getByText(/Mueller/).first()).toBeVisible();
  await next();
  await page.getByLabel('Date').fill(marketDate(options.inDays ?? 5));
  await page.getByRole('radio', { name: 'Choose a time window' }).check();
  await page.getByLabel('Window starts').selectOption('10:00');
  await page.getByLabel('Window ends').selectOption('12:00');
  await next();
  await page.getByRole('radio', { name: 'Fixed price' }).check();
  await page.getByLabel('Task price ($)').fill(String(options.priceDollars ?? 60));
  await next();
  await expect(page.getByText('Step 7 of 7', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Post task' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}
