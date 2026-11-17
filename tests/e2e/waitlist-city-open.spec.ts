import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { routes } from '../../src/contracts/routes';
import { waitlistEntries } from '../../src/modules/marketing/schema';
import { waitlistOneClickUrl, waitlistUnsubscribePageUrl } from '../../src/modules/marketing/waitlist-unsubscribe';
import { createDb } from '../../src/platform/db/connect';
import { untilShown } from './support/sign-in';

/**
 * Completion plan 8.3, the parts people touch: joining the waitlist keeps the page's language (the email telling
 * them their city opened goes out in it), and that email's unsubscribe link asks first, can be undone, and takes a
 * mail app's one-click post. Going live and the emails themselves are DB tests (tests/integration/city-open.test.ts):
 * no spec changes a seeded market's status. Each run uses its own address and removes its entry.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

test('joining in Spanish keeps the language; the email’s unsubscribe link asks first and can be undone', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const email = `wl-e2e-${testInfo.project.name}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@example.test`;
  const { db, pool } = database();
  try {
    await page.goto(`/es${routes.waitlist()}`);
    await untilShown(page.getByText('Ya estás en la lista.'), async () => {
      await page.getByLabel('Correo electrónico').fill(email, { timeout: 5_000 });
      await page.getByLabel('Código postal').fill('74103', { timeout: 5_000 });
      await page.getByLabel('Quiero ayudar').check({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Unirme a la lista de espera' }).click({ timeout: 5_000 });
    });
    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email));
    expect(entry).toMatchObject({ zip: '74103', interest: 'give_help', locale: 'es', tellStatus: null, unsubscribedAt: null });

    // The links in the email, built as the job builds them (Spanish, as they joined), followed on the server under test.
    const path = (url: string) => { const { pathname, search } = new URL(url); return `${pathname}${search}`; };
    const link = path(waitlistUnsubscribePageUrl('http://localhost', entry!.id, 'es'));
    expect(link).toMatch(/^\/es\/email\/waitlist\?token=w\./);
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: '¿Dejar de recibir correos de la lista de espera?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ya no recibirás correos de la lista de espera' })).toBeVisible();
    await expect.poll(async () => (await db.select({ at: waitlistEntries.unsubscribedAt }).from(waitlistEntries).where(eq(waitlistEntries.id, entry!.id)))[0]?.at ?? null).not.toBeNull();
    await page.getByRole('button', { name: 'Volver a activarlos' }).click();
    await expect(page.getByText('Los correos de la lista de espera se activaron de nuevo.')).toBeVisible();

    // One-click from a mail app: a POST to the header's address; a changed link does nothing.
    const oneClick = path(waitlistOneClickUrl('http://localhost', entry!.id));
    expect((await request.post(oneClick, { form: { 'List-Unsubscribe': 'One-Click' } })).status()).toBe(200);
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Ya no recibirás correos de la lista de espera' })).toBeVisible();
    expect((await request.post(oneClick.slice(0, -3))).status()).toBe(404);

    // A link that doesn't work says so.
    await page.goto(`/es${routes.waitlistUnsubscribe('w.wl_nobody.abc.def')}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Este enlace no funciona' })).toBeVisible();
  } finally {
    await db.delete(waitlistEntries).where(eq(waitlistEntries.email, email));
    await pool.end();
  }
});
