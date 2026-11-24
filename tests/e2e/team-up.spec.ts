import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { upsertPeople } from '../../db/seeds/seed';
import { usernames, users } from '../../src/modules/accounts/schema';
import { bookings } from '../../src/modules/bookings/schema';
import { threadParticipants, threads } from '../../src/modules/messaging/schema';
import { offers } from '../../src/modules/offers/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { bookingTeams } from '../../src/modules/teams/schema';
import { createDb } from '../../src/platform/db/connect';
import { confirmedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * Team up, 2026-11-24 (owner's chat ideas: "Team up: a helper brings a second helper onto a two-person job like moving,
 * with one shared chat with the client"). Jordan, booked by Chris, invites a second helper by @username for $45 from his
 * booking page (a dialog over it); the partner accepts in their team conversation; Chris sees "Jordan wants to bring …"
 * in his conversation with Jordan and Confirm opens the normal confirm dialog over the conversation. Each run has its own
 * booking and its own partner (a copy of seeded Sam under a new account and @username), removed after; seeded people are
 * only signed in as.
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

interface Partner { id: string; email: string; username: string; firstName: string }

/** A copy of seeded Sam (verified, bookable in Austin) under a new account, with an @username of its own. */
async function partnerCopy(): Promise<Partner> {
  const sam = PEOPLE.find((person) => person.id === 'usr_sam');
  if (!sam?.helper) throw new Error('Seeded Sam is missing');
  const { db, pool } = database();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomUUID().replaceAll('-', '').slice(0, 8);
      const person: SeedPerson = {
        ...sam,
        id: `usr_e2e_team_${token}`,
        email: `team-${token}@example.test`,
        lastName: `Sample${token}`,
        phone: `+1512556${randomInt(3000, 10_000)}`,
        helper: { ...sam.helper, handle: `sam-team-${token}` },
      };
      try {
        await db.transaction(async (tx) => upsertPeople(tx, [person]));
        const username = `team_${token}`;
        await db.insert(usernames).values({ userId: person.id, username });
        return { id: person.id, email: person.email, username, firstName: person.firstName };
      } catch (error) {
        const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
        if (code !== '23505') throw error;
      }
    }
    throw new Error('No free phone number for a team partner after 5 tries');
  } finally {
    await pool.end();
  }
}

/** The run's partner and everything the team made: the teams, the partner's part, the booking it ends with. */
async function cleanUp(partner: Partner | null, leadBookingId: string | null): Promise<void> {
  const { db, pool } = database();
  try {
    if (leadBookingId) {
      const teams = await db.select().from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadBookingId));
      const parts = teams.flatMap((team) => (team.partnerTaskId ? [team.partnerTaskId] : []));
      await db.update(bookingTeams).set({ status: 'canceled', closedAt: new Date() }).where(eq(bookingTeams.leadBookingId, leadBookingId));
      if (parts.length) {
        await db.update(bookings).set({ status: 'canceled', cancelReason: 'admin', canceledAt: new Date() }).where(inArray(bookings.taskId, parts));
        await db.update(offers).set({ status: 'withdrawn' }).where(inArray(offers.taskId, parts));
        await db.update(tasks).set({ status: 'canceled' }).where(inArray(tasks.id, parts));
      }
      await db.update(bookings).set({ status: 'canceled', cancelReason: 'admin', canceledAt: new Date() }).where(eq(bookings.id, leadBookingId));
    }
    if (partner) {
      await db.update(helperProfiles).set({ status: 'draft' }).where(eq(helperProfiles.userId, partner.id));
      await db.update(users).set({ status: 'deleted' }).where(eq(users.id, partner.id));
      await db.delete(usernames).where(eq(usernames.userId, partner.id));
    }
  } finally {
    await pool.end();
  }
}

async function teamOf(leadBookingId: string) {
  const { db, pool } = database();
  try {
    const [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadBookingId)).limit(1);
    return team ?? null;
  } finally {
    await pool.end();
  }
}

/** The lead booking's conversation, as its Message button would make it. */
async function bookingThread(bookingId: string, taskId: string): Promise<string> {
  const { db, pool } = database();
  try {
    const id = `thr_e2e_${bookingId.slice(4)}`;
    await db.insert(threads).values({ id, kind: 'booking', linkedId: bookingId, taskId, createdAt: new Date() }).onConflictDoNothing();
    await db.insert(threadParticipants).values([{ threadId: id, userId: 'usr_chris' }, { threadId: id, userId: 'usr_jordan' }]).onConflictDoNothing();
    return id;
  } finally {
    await pool.end();
  }
}

test('a lead brings a second helper: invite, accept, and the client confirms in the conversation', async ({ browser }) => {
  test.setTimeout(240_000);
  let partner: Partner | null = null;
  let leadBookingId: string | null = null;
  const context = await browser.newContext();
  try {
    partner = await partnerCopy();
    const booking = await confirmedBooking('team', 6000);
    leadBookingId = booking.bookingId;
    const leadThread = await bookingThread(booking.bookingId, booking.taskId);

    // Jordan invites from his booking page: a dialog over it.
    const jordan = await context.newPage();
    await devSignIn(jordan, 'jordan@example.test');
    await jordan.goto(`/app/bookings/${booking.bookingId}`);
    const panel = jordan.locator('[data-team-panel="lead"]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await panel.getByRole('button', { name: 'Team up' }).click();
    const dialog = jordan.getByRole('dialog', { name: 'Team up' });
    await dialog.getByLabel('Their @username').fill(`@${partner.username}`);
    await dialog.getByLabel('Task price ($)').fill('45');
    await dialog.getByLabel('Note for them (optional)').fill('Two flights of stairs.');
    await dialog.getByRole('button', { name: 'Send invite' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    expect(jordan.url()).toContain(`/app/bookings/${booking.bookingId}`);
    await expect(panel.locator('[data-team-card="invited"]')).toBeVisible({ timeout: 20_000 });

    // The partner answers in their team conversation with Jordan.
    const team = await teamOf(booking.bookingId);
    expect(team?.teamThreadId).toBeTruthy();
    const partnerContext = await browser.newContext();
    try {
      const sam = await partnerContext.newPage();
      await devSignIn(sam, partner.email);
      await sam.goto(`/app/messages/${team!.teamThreadId}`);
      const card = sam.locator('[data-team-card="invited"]').filter({ visible: true }).first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByText(/\$45(\.00)? for your part/)).toBeVisible();
      await expect(card.getByText('Two flights of stairs.')).toBeVisible();
      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(sam.locator('[data-team-card="accepted"]').filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await partnerContext.close();
    }

    // Chris confirms in his conversation with Jordan: the normal confirm dialog opens over it.
    const clientContext = await browser.newContext();
    try {
      const chris = await clientContext.newPage();
      await devSignIn(chris, 'chris@example.test');
      await chris.goto(`/app/messages/${leadThread}`);
      const card = chris.locator('[data-team-card="accepted"]').filter({ visible: true }).first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByText(new RegExp(`Jordan wants to bring ${partner.firstName}: \\$45(\\.00)? for ${partner.firstName}'s part`))).toBeVisible();
      await card.getByRole('button', { name: `Confirm ${partner.firstName}` }).click();
      await expect(chris).toHaveURL(/\/app\/tasks\/[^/]+\/offers\/[^/]+\/confirm/, { timeout: 30_000 });
      await expect(chris.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
      const confirmed = await teamOf(booking.bookingId);
      expect(confirmed?.status).toBe('confirmed');
    } finally {
      await clientContext.close();
    }
  } finally {
    await context.close();
    await cleanUp(partner, leadBookingId);
  }
});
