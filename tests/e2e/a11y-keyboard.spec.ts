import { expect, test, type Locator, type Page } from '@playwright/test';
import { auditPage, focusIsVisible, noTransitions, press, smallTargets, tabTo, typeInto } from './support/keyboard';
import { submittedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * WCAG 2.2 AA with the keyboard only (completion plan 5.8): the core journeys done without a mouse. Signing up,
 * posting a task, offering on it, booking and paying, messaging, approving and reviewing, reporting a problem,
 * and staff resolving it. Every control is reached with Tab, so it must be in the focus order with a visible
 * focus; every page passed through is checked with axe and for 24 × 24 px targets. Signing in as a seeded person
 * through /dev/sign-in is test setup, not part of the journey. The journeys make their own data (a new task, new
 * scenario bookings), so they never change what other specs read.
 */

test.skip(({ isMobile }) => isMobile, 'keyboard journeys run on desktop');
test.beforeEach(async ({ context, baseURL }) => {
  await noTransitions(context);
  await context.addCookies([{ name: 'tnm_geo_stand_in', value: '1', url: baseURL! }]);
});

/** Tab into a radio group and move to `radio` with the arrow keys (radios share one tab stop). */
async function chooseRadio(page: Page, radio: Locator): Promise<void> {
  const name = await radio.evaluate((element) => element.getAttribute('name') ?? element.closest('[role="radiogroup"]')?.id ?? '');
  const inGroup = () =>
    page.evaluate((group) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !(active.matches('input[type="radio"], [role="radio"]'))) return false;
      return (active.getAttribute('name') ?? active.closest('[role="radiogroup"]')?.id ?? '') === group;
    }, name);
  for (let presses = 0; presses < 120 && !(await inGroup()); presses++) await page.keyboard.press('Tab');
  expect(await inGroup(), `reach the radio group of ${radio}`).toBe(true);
  for (let moves = 0; moves < 12; moves++) {
    if (await radio.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(radio).toBeFocused();
  if (!(await radio.isChecked())) await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  expect((await focusIsVisible(page)).visible, `visible focus on ${radio}`).toBe(true);
}

/** Tab to a native select and move to `value` with the arrow keys. */
async function chooseOption(page: Page, select: Locator, value: string): Promise<void> {
  await tabTo(page, select);
  const values = await select.evaluate((element) => Array.from((element as HTMLSelectElement).options).map((option) => option.value));
  const target = values.indexOf(value);
  expect(target, `option ${value}`).toBeGreaterThanOrEqual(0);
  for (let moves = 0; moves < values.length && (await select.inputValue()) !== value; moves++) {
    await page.keyboard.press(values.indexOf(await select.inputValue()) < target ? 'ArrowDown' : 'ArrowUp');
  }
  await expect(select).toHaveValue(value);
}

/** Tab to a checkbox and tick it with Space. */
async function tick(page: Page, checkbox: Locator): Promise<void> {
  await tabTo(page, checkbox);
  if (!(await checkbox.isChecked())) await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
}

/** A calendar date in Austin, `days` from today, as the date field's keystrokes (MMDDYYYY). */
function dateKeys(days: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('month')}${part('day')}${part('year')}`;
}

async function latestCode(page: Page, to: string): Promise<string> {
  const outbox = await page.context().newPage();
  try {
    await outbox.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
    const body = await outbox.locator(`[data-testid="outbox-message"][data-to="${to}"]:not([data-tag="welcome"]) pre`).first().textContent();
    return body!.match(/\b(\d{6})\b/)![1]!;
  } finally {
    await outbox.close();
  }
}

test('the checks themselves: crowded small targets fail, spaced and labelled ones pass, a hidden focus is caught', async ({ page }) => {
  const small = 'width:16px;height:16px;padding:0;border:1px solid;position:absolute';
  await page.setContent(`
    <button style="${small};left:10px;top:10px">a</button>
    <button style="${small};left:30px;top:10px">b</button>
    <button style="${small};left:200px;top:200px">spaced</button>
    <label style="position:absolute;left:10px;top:100px;padding:8px">Pick <input type="radio" name="r" style="width:14px;height:14px;margin:0"></label>
    <p style="position:absolute;left:400px;top:10px;width:300px">Some running text with <a href="#x">a link</a> inside it.</p>
    <a href="#main" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Skip</a>
    <button id="ringless" style="position:absolute;left:400px;top:200px;outline:none">No ring</button>
    <button id="ringed" style="position:absolute;left:400px;top:260px">Ring</button>`);
  expect(await smallTargets(page)).toEqual(['button "a" 16×16', 'button "b" 16×16']);
  await page.keyboard.press('Tab');
  await page.locator('#ringless').focus();
  expect((await focusIsVisible(page)).visible).toBe(false);
  await page.locator('#ringed').focus();
  expect((await focusIsVisible(page)).visible).toBe(true);
});

test('keyboard only: a new person signs up with an emailed code', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const email = `e2e-kbd-${Date.now()}@example.test`;
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  await auditPage(page, testInfo.project.name);
  // The skip link comes first, shows itself when focused, and moves on to the page's content.
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  const skipBox = await skip.boundingBox();
  expect(skipBox && skipBox.width >= 24 && skipBox.height >= 24, 'the focused skip link is shown at a usable size').toBe(true);
  expect((await focusIsVisible(page)).visible, 'visible focus on the skip link').toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main'))), 'after the skip link, Tab goes into the main content').toBe(true);

  await typeInto(page, page.getByLabel('Email'), email);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await tabTo(page, page.getByLabel('6-digit code'));
  await page.keyboard.type(await latestCode(page, email));

  await expect(page.getByRole('heading', { level: 1, name: 'Tell us your name' })).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await typeInto(page, page.getByLabel('First name'), 'Kai');
  await typeInto(page, page.getByLabel('Last name'), 'Board');
  await tick(page, page.getByLabel(/18 or older/));
  await tick(page, page.getByLabel(/I agree to the Terms of service/));
  await press(page, page.getByRole('button', { name: 'Continue', exact: true }));
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
});

test('keyboard only: post a task, a helper offers, the client books and pays, then messages', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  // The client posts with the wizard.
  await devSignIn(page, 'maya@example.test');
  await page.goto('/app/tasks/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Post a task' })).toBeVisible();
  await auditPage(page, testInfo.project.name);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await chooseRadio(page, page.getByRole('radio', { name: /Furniture assembly/ }));
  await press(page, next);

  const title = `Keyboard bookshelf ${Date.now().toString(36)}`;
  await typeInto(page, page.getByLabel('Task title'), title);
  await typeInto(page, page.getByRole('textbox', { name: 'What do you need help with?' }), 'Flat-pack bookshelf, about 30 parts. The box is in the hallway.');
  await press(page, next);
  await chooseOption(page, page.getByLabel('What needs assembling?'), 'bookshelf');
  await typeInto(page, page.getByLabel('Number of items', { exact: true }), '1');
  await press(page, next);
  await press(page, next); // Photos are optional.

  await chooseRadio(page, page.getByRole('radio', { name: 'In person' }));
  await typeInto(page, page.getByRole('combobox', { name: 'Search your address' }), '1240 example');
  await expect(page.getByRole('option', { name: /1240 Example Lane/ })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Mueller/).first()).toBeVisible();
  await press(page, next);

  await tabTo(page, page.getByLabel('Date'));
  await page.keyboard.type(dateKeys(6));
  await chooseRadio(page, page.getByRole('radio', { name: 'Choose a time window' }));
  await chooseOption(page, page.getByLabel('Window starts'), '10:00');
  await chooseOption(page, page.getByLabel('Window ends'), '12:00');
  await press(page, next);

  await chooseRadio(page, page.getByRole('radio', { name: 'Fixed price' }));
  await typeInto(page, page.getByLabel('Task price ($)'), '60');
  await press(page, next);
  await expect(page.getByText('$66.00').first()).toBeVisible({ timeout: 20_000 });
  await auditPage(page, testInfo.project.name);
  await press(page, page.getByRole('button', { name: 'Post task' }));
  await expect(page).toHaveURL(/\/app\/tasks\/tsk_[0-9a-f]+$/, { timeout: 30_000 });
  const taskId = new URL(page.url()).pathname.split('/').pop()!;
  await auditPage(page, testInfo.project.name);

  // A helper offers on it.
  await devSignIn(page, 'jordan@example.test');
  await page.goto(`/app/find-work/${taskId}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await typeInto(page, page.getByLabel('Message to the client'), 'I can assemble it on the day, and I bring my own tools.');
  await press(page, page.getByRole('button', { name: 'Send offer' }));
  await expect(page.getByRole('heading', { name: 'Your offer' })).toBeVisible({ timeout: 30_000 });

  // The client books it and pays with the test card.
  await devSignIn(page, 'maya@example.test');
  await page.goto(`/app/tasks/${taskId}`);
  const offerLink = page.locator(`a[href*="/app/tasks/${taskId}/offers/off_"]`).first();
  await expect(offerLink).toBeVisible({ timeout: 30_000 });
  await press(page, offerLink);
  await expect(page).toHaveURL(new RegExp(`/app/tasks/${taskId}/offers/off_`), { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await press(page, page.getByRole('button', { name: 'Book helper' }));
  await expect(page.getByRole('heading', { level: 1, name: 'Confirm and pay' })).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  const success = page.getByRole('radio', { name: 'Success' });
  if (await success.count()) await chooseRadio(page, success);
  await tick(page, page.getByRole('checkbox', { name: /I agree to the/ }));
  await press(page, page.getByRole('button', { name: /^Book and pay/ }));
  await expect(page).toHaveURL(/\/app\/bookings\/bkg_/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await auditPage(page, testInfo.project.name);

  // And writes to the helper.
  await press(page, page.getByRole('button', { name: 'Send message' }).or(page.getByRole('link', { name: 'Send message' })).first());
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await typeInto(page, page.getByRole('textbox', { name: 'Message' }), 'The box is by the door. See you then.');
  await press(page, page.getByRole('button', { name: 'Send' }));
  // In the conversation itself: on wide screens the conversation list beside it previews the same words.
  await expect(page.getByRole('log').getByText('The box is by the door. See you then.')).toBeVisible({ timeout: 30_000 });
});

test('keyboard only: the client approves and reviews, with focus back on the button after a dialog', async ({ page }, testInfo) => {
  test.setTimeout(200_000);
  const scenario = await submittedBooking('kbd-approve');
  await devSignIn(page, 'chris@example.test');
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);

  // A dialog opened with the keyboard and closed with Escape gives focus back to what opened it.
  const approve = page.getByRole('button', { name: 'Approve task' }).first();
  await press(page, approve);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(approve).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  // The dialog says what approving does (journeys on a phone, J-C5).
  await expect(dialog.getByRole('heading', { name: 'Approve the completed task?' })).toBeVisible();
  await press(page, dialog.getByRole('button', { name: 'Approve and release payment' }));
  // While the dialog is open the page behind it is hidden from the accessibility tree, so wait for it to close.
  await expect(dialog).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByText('Needs your approval')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Approve task' })).toHaveCount(0);
  // With "Approve task" gone, focus moves to the result in the page, not back to the top (2.4.3).
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('main')) && document.activeElement !== document.getElementById('main')), { message: 'focus stays on the booking after approving' }).toBe(true);

  await press(page, page.getByRole('button', { name: 'Leave a review' }).or(page.getByRole('link', { name: 'Leave a review' })).first());
  await expect(page).toHaveURL(new RegExp(`/app/bookings/${scenario.bookingId}/review$`), { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await chooseRadio(page, page.getByRole('radio', { name: '5 of 5 stars' }));
  await press(page, page.getByRole('button', { name: 'Send review' }));
  await expect(page).toHaveURL(new RegExp(`/app/bookings/${scenario.bookingId}$`), { timeout: 30_000 });
});

test('keyboard only: the client reports a problem and staff resolve the case', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const scenario = await submittedBooking('kbd-problem');
  await devSignIn(page, 'chris@example.test');
  await page.goto(`/app/bookings/${scenario.bookingId}`);
  await expect(page.getByRole('heading', { level: 1, name: scenario.title })).toBeVisible({ timeout: 30_000 });
  await press(page, page.getByRole('button', { name: 'Report a problem' }).or(page.getByRole('link', { name: 'Report a problem' })).first());
  await expect(page.getByRole('heading', { level: 1, name: 'Report a problem' })).toBeVisible({ timeout: 45_000 });
  await auditPage(page, testInfo.project.name);
  await chooseRadio(page, page.getByRole('radio', { name: "The work isn't finished" }));
  await typeInto(page, page.getByLabel('What happened?'), 'Two drawers still stick and one handle is missing.');
  await press(page, page.getByRole('button', { name: 'Report the problem' }));
  const confirm = page.getByRole('alertdialog');
  await press(page, confirm.getByRole('button', { name: 'Send report' }));
  // Where sending leads: the booking with the problem on it. The form's own success line shows only until that
  // page arrives (the router keeps the form hidden behind it), so it isn't what to wait for.
  await expect(page.getByRole('heading', { level: 2, name: 'Problem reported' })).toBeVisible({ timeout: 30_000 });

  // Staff find the case from the booking and settle it.
  await devSignIn(page, 'morgan@example.test', { landing: /\/admin\/verify$/ });
  await typeInto(page, page.getByLabel('Code'), '123456');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await page.goto(`/admin/bookings/${scenario.bookingId}`);
  const caseLink = page.locator('a[href*="/admin/cases/case_"]').first();
  await expect(caseLink).toBeVisible({ timeout: 30_000 });
  await auditPage(page, testInfo.project.name);
  await press(page, caseLink);
  await expect(page).toHaveURL(/\/admin\/cases\/case_/, { timeout: 30_000 });
  await auditPage(page, testInfo.project.name);

  await press(page, page.getByRole('button', { name: 'Resolve' }).first());
  const resolve = page.getByRole('alertdialog', { name: 'Resolve case' });
  await expect(resolve).toBeVisible();
  await chooseRadio(page, resolve.getByRole('radio', { name: 'Settle at a lower price' }));
  await typeInto(page, resolve.getByLabel('New task price (USD)'), '45');
  await typeInto(page, resolve.getByLabel('Resolution summary'), 'Settled at $45 because two drawers still stick.');
  await expect(resolve.getByText('$16.50').first()).toBeVisible({ timeout: 20_000 });
  await press(page, resolve.getByRole('button', { name: 'Save resolution' }));
  await expect(page.getByText('Resolution saved.').first()).toBeVisible({ timeout: 30_000 });
});
