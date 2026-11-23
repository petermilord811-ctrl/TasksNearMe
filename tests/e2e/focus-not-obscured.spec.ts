import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTask, openTask, submittedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * WCAG 2.2 SC 2.4.11 (Focus Not Obscured) on a short screen (journeys on a phone, J-C-m). A browser that shrinks the
 * page for the phone keyboard leaves about 430 px of a 360 × 800 screen, and a form's sticky bar (Back and Next,
 * Send review) keeps its place at the bottom of what's left. Chrome's own focus scroll only reveals a text field's
 * caret, so a field whose first line shows behind the bar stays there: the forms bring the focused field, and the
 * hint and count that describe it, clear of the bar themselves.
 */

test.skip(({ isMobile }) => !isMobile, 'a phone matter');
// Scrolling is smooth otherwise (globals.css), and positions measured mid-glide say nothing; where scrolls end is the same.
test.use({ reducedMotion: 'reduce' });

async function keyboardOpen(page: Page): Promise<void> {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 });
}

/** The top of the sticky bar that holds `button`. */
function barTop(button: Locator): Promise<number> {
  return button.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'sticky') return node.getBoundingClientRect().top;
    }
    throw new Error('no sticky bar holds this button');
  });
}

/**
 * Leaves `field` starting just below the top of the bar, its first line showing through it (as a short screen leaves
 * the next field), focuses the control before it without scrolling, and presses Tab.
 */
async function tabToFieldBehindBar(page: Page, field: Locator, button: Locator): Promise<void> {
  const top = await barTop(button);
  await field.evaluate((target, park) => {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'));
    focusable[focusable.indexOf(target as HTMLElement) - 1]!.focus({ preventScroll: true });
    window.scrollBy({ top: target.getBoundingClientRect().top - park, behavior: 'instant' });
  }, top + 8);
  expect((await field.boundingBox())!.y, 'the field starts behind the bar').toBeGreaterThan(await barTop(button));
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
}

async function expectAboveBar(field: Locator, button: Locator): Promise<void> {
  const top = await barTop(button);
  const box = (await field.boundingBox())!;
  expect(box.y + box.height, 'the field ends above the bar').toBeLessThanOrEqual(top);
  const described = await field.evaluate((element) =>
    (element.getAttribute('aria-describedby') ?? '').split(/\s+/).flatMap((id) => {
      const node = id ? document.getElementById(id) : null;
      return node ? [{ id, bottom: node.getBoundingClientRect().bottom }] : [];
    }),
  );
  expect(described.length, 'the field has a hint or a count').toBeGreaterThan(0);
  for (const { id, bottom } of described) expect(bottom, `#${id} ends above the bar`).toBeLessThanOrEqual(top);
}

test('the posting wizard: Back and Next never cover the field being typed in, or its hint', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  await page.getByRole('radio', { name: /Furniture assembly/ }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 2 of 7', { exact: false })).toBeVisible();
  const title = page.getByLabel('Task title');
  await title.fill('Assemble a bookshelf for the hallway');
  const description = page.getByRole('textbox', { name: 'What do you need help with?' });
  const next = page.getByRole('button', { name: 'Next', exact: true });

  // Tab into a field whose first line shows behind the bar.
  await keyboardOpen(page);
  await tabToFieldBehindBar(page, description, next);
  await expectAboveBar(description, next);

  // A keyboard that shrinks the page opens after the focus: the field is checked again then.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 800 });
  await title.focus();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await description.focus();
  await keyboardOpen(page);
  await expect(description).toBeFocused();
  // The resize reaches the page a frame after the viewport changes, and the form scrolls then: measure once it has.
  await expect(async () => expectAboveBar(description, next)).toPass({ timeout: 5_000 });
});

test('the review form: Send review never covers the review being typed, or its count', async ({ page }) => {
  test.setTimeout(150_000);
  const scenario = await submittedBooking('focus-bar');
  await devSignIn(page, 'chris@example.test');
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await page.getByRole('button', { name: 'Approve task' }).filter({ visible: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve the task' }).click();
  await expect(page.getByRole('button', { name: 'Approve task' }).filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
  await page.goto(`/app/bookings/${scenario.bookingId}/review`);
  const body = page.getByLabel('Your review (optional)');
  await expect(body).toBeVisible({ timeout: 30_000 });

  await keyboardOpen(page);
  const send = page.getByRole('button', { name: 'Send review' });
  await tabToFieldBehindBar(page, body, send);
  await expectAboveBar(body, send);
});

test('the offer form: Send offer never covers the message being typed, or its count', async ({ page }) => {
  test.setTimeout(150_000);
  const task = await openTask('focus-offer');
  try {
    await devSignIn(page, 'jordan@example.test');
    await page.goto(`/app/find-work/${task.taskId}`);
    const message = page.getByLabel('Message to the client');
    await expect(message).toBeVisible({ timeout: 30_000 });

    await keyboardOpen(page);
    const send = page.getByRole('button', { name: 'Send offer' });
    await tabToFieldBehindBar(page, message, send);
    await expectAboveBar(message, send);
  } finally {
    await closeTask(task.taskId);
  }
});
