import { expect, test, type Page } from '@playwright/test';
import copy from '../../messages/en/ui/helpContact.json';
import copyEs from '../../messages/es/ui/helpContact.json';
import adminCase from '../../messages/en/ui/adminCase.json';
import { devSignIn } from './support/sign-in';

/**
 * Completion plan 5.22: support for people who aren't signed in. A visitor writes from the help center's
 * contact form, in English and in Spanish, and gets the same confirmation by email. Staff find the case by
 * its address and answer it by email, in the visitor's language, with the warning about account details.
 */

const run = Date.now().toString(36);
const message = 'I changed phones and the sign-in code never arrives at my old number.';

async function outboxText(page: Page, to: string): Promise<string> {
  await page.goto(`/dev/outbox?to=${encodeURIComponent(to)}`);
  // The list streams in after the page's shell; read it, not its loading line.
  await expect(page.getByText('Loading messages…')).toHaveCount(0, { timeout: 30_000 });
  return (await page.locator('main').textContent()) ?? '';
}

async function send(page: Page, labels: typeof copy, email: string, topic: keyof typeof copy.topics) {
  const form = page.getByRole('form', { name: labels.form });
  await form.getByRole('textbox', { name: labels.email }).fill(email);
  await form.getByRole('radio', { name: labels.topics[topic] }).check();
  await form.getByRole('textbox', { name: labels.message }).fill(message);
  // A click before the page hydrates does nothing on a busy server: click again until it takes.
  await expect(async () => {
    if (await form.isVisible()) await form.getByRole('button', { name: labels.send }).click({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: labels.sent.title })).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: email })).toBeVisible();
}

async function staffSignIn(page: Page, email: string) {
  await devSignIn(page, email, { landing: /\/admin\/verify$/ });
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test('a visitor writes from the help center and gets a confirmation that doesn’t repeat the message', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'phones first; one visitor per run');
  test.setTimeout(120_000);
  const email = `visitor-${run}@example.test`;
  await page.goto('/help');
  await page.getByRole('main').getByRole('link', { name: 'Contact support' }).click();
  await expect(page).toHaveURL(/\/help\/contact$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
  await expect(page.getByRole('link', { name: copy.signedIn.link })).toHaveAttribute('href', '/app/support');

  // Nothing goes without a topic.
  const form = page.getByRole('form', { name: copy.form });
  await form.getByRole('textbox', { name: copy.email }).fill(email);
  await expect(async () => {
    await form.getByRole('button', { name: copy.send }).click({ timeout: 5_000 });
    await expect(form.getByText(copy.topicRequired)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });

  await send(page, copy, email, 'account_access');
  const mail = await outboxText(page, email);
  expect(mail).toContain('We got your message');
  expect(mail).not.toContain('sign-in code never arrives');
});

test('a Spanish visitor writes, and staff answer by email in Spanish without account details', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);
  const email = `vecino-${run}@example.test`;
  await page.goto('/es/help/contact');
  await expect(page.getByRole('heading', { level: 1, name: copyEs.title })).toBeVisible({ timeout: 30_000 });
  await send(page, copyEs, email, 'payment');
  expect(await outboxText(page, email)).toContain('Recibimos tu mensaje');

  await staffSignIn(page, 'alex@example.test');
  await page.goto('/admin/cases?queue=requests');
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole('link', { name: 'Payment' }).click();
  await expect(page.getByRole('heading', { level: 2, name: adminCase.details.contact.title })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(adminCase.details.contact.noAccount)).toBeVisible();

  const answer = page.getByRole('form', { name: adminCase.emailContact.title });
  await expect(answer.getByText(adminCase.emailContact.warning)).toBeVisible();
  await expect(page.getByRole('form', { name: adminCase.reply.title })).toHaveCount(0);
  await answer.getByRole('textbox', { name: adminCase.emailContact.body }).fill('Hola, gracias por escribir. Inicia sesión y abre Pagos para ver el cobro.');
  await answer.getByRole('button', { name: adminCase.emailContact.send }).click();
  await expect(answer.getByText(adminCase.emailContact.sent)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Emailed to ${email}`)).toBeVisible({ timeout: 30_000 });

  const mail = await outboxText(page, email);
  expect(mail).toContain('Una respuesta de soporte de TasksNearMe');
  expect(mail).toContain('Inicia sesión y abre Pagos');
});
