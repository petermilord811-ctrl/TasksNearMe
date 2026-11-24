import { expect, test, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { rateLimits } from '../../src/platform/rate-limit/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * "Translate this conversation" and "Catch me up" (2026-11-24, owner: "implement others all one by one"). Lia writes in
 * Spanish; Hal reads English. Hal opens the conversation with ten unread messages: "Catch me up" waits above "New
 * messages" and summarizes them; the ⋯ menu translates the whole conversation, a message shows its original on request,
 * the choice outlives a reload, and a message that arrives is translated too. On wide screens the chat window does the
 * same. The models' stand-ins only (the `tnm_ai_stand_in` cookie), never a model. Everyone here is made for the test and
 * removed after.
 */

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  return createDb(url, { max: 1 });
}

interface Cast {
  clientId: string;
  clientEmail: string;
  helperId: string;
  helperEmail: string;
  threadId: string;
}

const SPANISH = [
  'Hola Hal, ya tengo todo listo para el sábado.',
  '¿Puedes venir el sábado a las 10?',
  'El sofá está en la sala, junto a la ventana.',
  'Hay que bajarlo por la escalera.',
  '¿Traes correas o las compro yo?',
  'Puedes estacionar enfrente de la casa.',
  'Mi vecino también necesita ayuda con unas cajas.',
  '¿Cuánto tiempo crees que vas a tardar?',
  'Gracias por tu ayuda.',
  'Avísame cuando estés en camino.',
];

/** Lia and Hal talk directly; Hal answered once, then Lia wrote ten more he hasn't read. */
async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = { clientId: `usr_e2e_ca_${run}`, clientEmail: `e2e-ca-${run}@example.test`, helperId: `usr_e2e_ca_helper_${run}`, helperEmail: `e2e-ca-helper-${run}@example.test`, threadId: `thr_e2e_ca_${run}` };
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    if (!chris || !jordan) throw new Error('The seeded people are missing');
    await db.insert(users).values([
      { ...chris, id: cast.clientId, email: cast.clientEmail, name: 'Lia L.', firstName: 'Lia', lastName: 'Lane', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'es' },
      { ...jordan, id: cast.helperId, email: cast.helperEmail, name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' },
    ]);
    const start = Date.now() - 60 * 60_000;
    const at = (minutes: number) => new Date(start + minutes * 60_000);
    const pair = cast.clientId < cast.helperId ? `${cast.clientId}:${cast.helperId}` : `${cast.helperId}:${cast.clientId}`;
    await db.insert(threads).values({ id: cast.threadId, kind: 'direct', linkedId: pair, startedByUserId: cast.clientId, createdAt: at(0), lastMessageAt: at(30) });
    await db.insert(threadParticipants).values([
      { threadId: cast.threadId, userId: cast.clientId, lastReadAt: at(30), acceptedAt: at(0) },
      { threadId: cast.threadId, userId: cast.helperId, lastReadAt: at(2), acceptedAt: at(1) },
    ]);
    await db.insert(messages).values([
      { id: `msg_e2e_ca_${run}_0`, threadId: cast.threadId, senderUserId: cast.clientId, kind: 'text', body: 'Hola, ¿me ayudas a mover un sofá?', createdAt: at(0) },
      { id: `msg_e2e_ca_${run}_1`, threadId: cast.threadId, senderUserId: cast.helperId, kind: 'text', body: 'Hi Lia! Sure, tell me more.', createdAt: at(1) },
      ...SPANISH.map((body, index) => ({ id: `msg_e2e_ca_${run}_${index + 2}`, threadId: cast.threadId, senderUserId: cast.clientId, kind: 'text', body, createdAt: at(10 + index) })),
    ]);
    return cast;
  } finally {
    await pool.end();
  }
}

/** Hal hasn't read Lia's ten again (for the chat window's own opening). */
async function unreadAgain(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    await db.update(threadParticipants).set({ lastReadAt: new Date(Date.now() - 55 * 60_000) }).where(and(eq(threadParticipants.threadId, cast.threadId), eq(threadParticipants.userId, cast.helperId)));
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.clientId, cast.helperId];
    await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, cast.threadId));
    await db.delete(messages).where(eq(messages.threadId, cast.threadId));
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, cast.threadId));
    await db.delete(threads).where(eq(threads.id, cast.threadId));
    for (const id of people) await db.delete(rateLimits).where(inArray(rateLimits.key, [`messages:translate-many:${id}`, `messages:catch-up:${id}`]));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

const menu = (scope: Page | ReturnType<Page['getByRole']>) => scope.getByRole('button', { name: 'Options for your conversation with Lia L.' });

test('ten unread in Spanish: Catch me up summarizes them, and the whole conversation reads in English, new messages too', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    await page.context().addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
    await devSignIn(page, cast.helperEmail);
    await page.goto(`/app/messages/${cast.threadId}`);
    const log = page.getByRole('log');

    // Offered at once, above "New messages"; the stand-in counts who wrote what.
    const card = page.getByRole('region', { name: 'Catch-up summary' });
    await expect(card).toContainText('Lia sent you 10 new messages', { timeout: 30_000 });
    await card.getByRole('button', { name: 'Summarize' }).click();
    await expect(card).toContainText('Lia sent 10 messages and you sent 0.', { timeout: 30_000 });
    await expect(card).toContainText('AI summary, may be wrong');
    await expect(card).toContainText('Latest from Lia: “Avísame cuando estés en camino.”');
    await card.getByRole('button', { name: 'Dismiss the summary' }).click();
    await expect(card).toHaveCount(0);

    // The whole conversation in English (the stand-in marks it); Hal's own words and the ones already in English stay.
    await menu(page).click();
    await page.getByRole('menuitem', { name: 'Translate this conversation' }).click();
    await expect(page.getByText('Showing Lia’s messages in English')).toBeVisible();
    await expect(log.getByText('[EN] ¿Puedes venir el sábado a las 10?')).toBeVisible({ timeout: 30_000 });
    await expect(log.getByText('Hi Lia! Sure, tell me more.')).toBeVisible();
    const bubble = log.locator('li[data-message-id]').filter({ hasText: '[EN] El sofá está en la sala' });
    await bubble.getByRole('button', { name: 'Show original' }).click();
    await expect(log.getByText('El sofá está en la sala, junto a la ventana.', { exact: true })).toBeVisible();

    // Remembered in this browser: a reload translates again.
    await page.reload();
    await expect(page.getByRole('log').getByText('[EN] Gracias por tu ayuda.')).toBeVisible({ timeout: 30_000 });

    // A message that arrives is translated as it comes.
    const client = await browser.newContext();
    try {
      const lia = await client.newPage();
      await devSignIn(lia, cast.clientEmail);
      await lia.goto(`/app/messages/${cast.threadId}`);
      // Lia's pages may read in Spanish (her language).
      const box = lia.getByRole('textbox', { name: /^(Message|Mensaje)$/ });
      await box.fill('¿Traes la carretilla también?');
      // Send, not Enter: on phones Enter is a new line.
      await lia.getByRole('button', { name: /^(Send|Enviar)$/ }).click();
      await expect(lia.getByRole('log').getByText('¿Traes la carretilla también?')).toBeVisible({ timeout: 30_000 });
    } finally {
      await client.close();
    }
    await expect(page.getByRole('log').getByText('[EN] ¿Traes la carretilla también?')).toBeVisible({ timeout: 45_000 });

    // Off from the bar: the originals, and forgotten after a reload.
    await page.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByRole('log').getByText('Gracias por tu ayuda.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('log').getByText('Gracias por tu ayuda.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Showing Lia’s messages in English')).toHaveCount(0);
  } finally {
    await removeCast(cast);
  }
});

test('the chat window offers Catch me up and translates the conversation too (wide screens)', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'the window is for wide screens; phones open the Messages page');
  test.setTimeout(180_000);
  const cast = await makeCast();
  try {
    await page.context().addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
    await devSignIn(page, cast.helperEmail);
    await unreadAgain(cast);
    await page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ }).click();
    const box = page.getByRole('dialog', { name: 'Messages' });
    await box.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Lia L\./ }).first().click();
    const card = box.getByRole('region', { name: 'Catch-up summary' });
    await expect(card).toContainText('Lia sent you 10 new messages', { timeout: 30_000 });
    await card.getByRole('button', { name: 'Summarize' }).click();
    await expect(card).toContainText('AI summary, may be wrong', { timeout: 30_000 });

    await menu(box).click();
    await page.getByRole('menuitem', { name: 'Translate this conversation' }).click();
    await expect(box.getByRole('log').getByText('[EN] Avísame cuando estés en camino.')).toBeVisible({ timeout: 30_000 });
    // The ⋯ menu's "Catch me up" asks again (nothing unread now: the latest messages).
    await menu(box).click();
    await page.getByRole('menuitem', { name: 'Catch me up' }).click();
    await expect(box.getByRole('region', { name: 'Catch-up summary' })).toContainText('Lia sent', { timeout: 30_000 });
  } finally {
    await removeCast(cast);
  }
});
