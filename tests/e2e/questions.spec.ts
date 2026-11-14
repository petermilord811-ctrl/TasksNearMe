import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Questions on a task (completion plan 7.9): Lee, a verified helper, asks about Ben's leaf cleanup before
 * offering (a phone number in it is masked), can't ask a second one while it's open, and Ben answers and pins it.
 */
test('a helper asks before offering, and the poster answers and pins it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(150_000);
  await devSignIn(page, 'lee@example.test');
  await page.goto('/app/find-work/tsk_yard');
  const questions = page.getByRole('region', { name: /^Questions/ });
  await expect(questions).toBeVisible();
  await questions.getByLabel('Ask a question').fill('Is the side gate unlocked, or should I call 512-555-0123 when I arrive?');
  await questions.getByRole('button', { name: 'Ask', exact: true }).click();
  // Once it's saved the ask box is gone (one open question at a time), so the words are only in the list.
  await expect(questions.getByText("You asked a question. You can ask another once it's answered.")).toBeVisible({ timeout: 15_000 });
  await expect(questions.getByRole('listitem').getByText(/Is the side gate unlocked/).first()).toBeVisible();
  await expect(questions.getByText(/512-555-0123/)).toHaveCount(0);

  await devSignIn(page, 'ben@example.test');
  await page.goto('/app/tasks/tsk_yard');
  const mine = page.getByRole('region', { name: /^Questions/ });
  await expect(mine.getByText(/Is the side gate unlocked/).first()).toBeVisible();
  await mine.getByLabel('Your answer').fill('The side gate is unlocked. The bags are in the garage.');
  await mine.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(mine.getByRole('button', { name: 'Pin for everyone' })).toBeVisible({ timeout: 15_000 });
  await expect(mine.getByRole('listitem').getByText('The side gate is unlocked. The bags are in the garage.', { exact: true }).first()).toBeVisible();
  await mine.getByRole('button', { name: 'Pin for everyone' }).click();
  await expect(mine.getByText('Pinned', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await devSignIn(page, 'lee@example.test');
  await page.goto('/app/find-work/tsk_yard');
  await expect(page.getByRole('region', { name: /^Questions/ }).getByText('The side gate is unlocked. The bags are in the garage.').first()).toBeVisible();
});
