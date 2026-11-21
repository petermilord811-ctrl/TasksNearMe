import { expect, test } from '@playwright/test';
import { devSignIn } from './support/sign-in';

/**
 * Writing help (UI-048): "Rewrite with AI" in the posting description field, and "Write it for me" on a helper's profile
 * and offer message. The `tnm_ai_stand_in` cookie gets the rule-based stand-ins, so these tests never call
 * a model even where model keys (GEMINI_API_KEY, GROQ_API_KEY, KIMI_API_KEY) are set. Nothing here saves anything.
 */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
});

test('posting: "Rewrite with AI" rewrites the description in place as a formatted post, and Undo brings the words back', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  const words = 'two ikea bookshelves on the 3rd floor, no elevator. call 512-555-0199';
  const description = page.getByRole('textbox', { name: 'What do you need help with?' });
  await description.fill(words);
  await page.getByRole('button', { name: 'Rewrite with AI' }).click();
  // The phone number never makes it into a public description; the rewrite is a formatted post.
  await expect(description).toHaveValue(/\[hidden\]/);
  await expect(description).not.toHaveValue(/512-555-0199/);
  await expect(description).toHaveValue(/\n## What needs doing\n- /);
  await expect(page.getByLabel('Task title')).toHaveValue(/^Assemble 2 flat-pack /);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(description).toHaveValue(words);
});

test("a helper drafts their profile from a few words; Undo and leaving the page keep what's saved", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  await page.goto('/app/helper/profile');
  const headline = page.getByLabel('Headline');
  await expect(headline).toBeVisible();
  const saved = await headline.inputValue();

  await page.getByLabel('A few words about you (optional)').fill('Patient and tidy. I always bring a level.');
  await page.getByRole('button', { name: 'Draft my profile' }).click();
  await expect(page.getByText('Drafted for you.')).toBeVisible();
  await expect(page.getByLabel('About you', { exact: true })).toHaveValue(/Patient and tidy\. I always bring a level\./);
  await expect(headline).not.toHaveValue(saved);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(headline).toHaveValue(saved);
  await page.reload();
  await expect(page.getByLabel('Headline')).toHaveValue(saved);
});

test('a helper drafts the message on their offer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'read-only; one project is enough');
  await devSignIn(page, 'jordan@example.test');
  // Jordan's seeded offer on the desk: drafting in the edit form changes nothing until it's sent.
  await page.goto('/app/find-work/tsk_desk');
  await page.getByRole('button', { name: 'Edit offer' }).click();
  const message = page.getByLabel('Message to the client');
  await message.fill('Have a drill and a level');
  await page.getByRole('button', { name: 'Write it for me' }).click();
  await expect(message).toHaveValue(/^Hi! I'd be glad to help with "Assemble a desk/);
  await expect(message).toHaveValue(/Have a drill and a level/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(message).toHaveValue('Have a drill and a level');
});
