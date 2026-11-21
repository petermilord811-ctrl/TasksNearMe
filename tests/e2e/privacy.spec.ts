import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { pressWhileHydrating } from './support/hydration';
import { devSignIn } from './support/sign-in';
import { zipEntries } from './support/zip';

/**
 * Privacy requests (completion plan 3.3) on the seeded data: a copy of the data (a zip of the JSON and the photos the
 * person added), prepared by the job runner and downloaded from the account page, and a deletion asked for and taken
 * back.
 */

test('a copy of my data is prepared and downloads as a file; a deletion can be taken back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  // The job runner prepares the copy; on a busy CI runner that alone can take a couple of minutes.
  test.setTimeout(300_000);
  await devSignIn(page, 'lee@example.test');
  await page.goto('/app/account');
  const privacy = page.getByRole('group', { name: 'Privacy' });

  // A retry finds the first attempt's copy already asked for (or ready): ask only when the button is offered.
  const ask = privacy.getByRole('button', { name: 'Request a copy of my data' });
  const download = page.getByRole('link', { name: 'Download my data (ZIP)' });
  await expect(ask.or(download).or(privacy.getByText(/preparing your copy/i)).first()).toBeVisible({ timeout: 30_000 });
  if (await ask.isVisible()) {
    await ask.click();
    await expect(privacy.getByText(/preparing your copy/i)).toBeVisible();
  }
  // The job runner prepares it within a minute or so.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('link', { name: 'Download my data (ZIP)' })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^tasksnearme-data-\d{4}-\d{2}-\d{2}\.zip$/);
  // A zip: the JSON, and the photos the person added (privacy rehearsal J-PR10).
  const entries = zipEntries(await readFile((await file.path())!));
  const json = [...entries.keys()].find((name) => /^tasksnearme-data-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  const data = JSON.parse(entries.get(json!)!.toString('utf8'));
  expect(data).toMatchObject({ format: 'tasksnearme-data-export/1', account: { email: 'lee@example.test' } });
  // Pressed before the page has hydrated and released after (a slow laptop), it still downloads: nothing above the
  // link changes size as the page hydrates. On the Ship run at eb8cba5 the click above was lost that way.
  const [again] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), pressWhileHydrating(page, download)]);
  expect(again.suggestedFilename()).toBe(file.suggestedFilename());

  // A retry after the deletion step finds the deletion still asked for: take it back first.
  const keep = privacy.getByRole('button', { name: 'Keep my account' });
  if (await keep.isVisible()) await keep.click();
  await privacy.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Request account deletion' }).click();
  await expect(privacy.getByText(/Your account will be deleted on/)).toBeVisible();
  await privacy.getByRole('button', { name: 'Keep my account' }).click();
  await expect(privacy.getByRole('button', { name: 'Delete my account' })).toBeVisible();
  await expect(privacy.getByText('Your account stays. Nothing was deleted.')).toBeVisible();
});
