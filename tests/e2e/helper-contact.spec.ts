import { expect, test } from '@playwright/test';
import { and, eq, inArray, like } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { communityPosts } from '../../src/modules/community/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { auditLog } from '../../src/platform/audit/schema';
import { createDb } from '../../src/platform/db/connect';
import { rateLimits } from '../../src/platform/rate-limit/schema';
import { openAccountGroup } from './support/account';
import { devSignIn } from './support/sign-in';

/**
 * Contact details on a helper's profile (owner, 2026-11-24): the helper chooses on the account page to share their
 * email and phone; a neighbor with 2,000 earned Sparks (a Pillar) sees them on the profile with "Show"; a newcomer sees
 * how far they are; a visitor who isn't signed in sees nothing. Everyone here is made for the test and removed after.
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
  run: string;
  helperId: string;
  helperEmail: string;
  helperPhone: string;
  handle: string;
  fanId: string;
  fanEmail: string;
  newcomerId: string;
  newcomerEmail: string;
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = {
      run,
      helperId: `usr_e2e_hc_helper_${run}`,
      helperEmail: `e2e-hc-helper-${run}@example.test`,
      helperPhone: `+1512555${String(Math.floor(Math.random() * 9000) + 1000)}`,
      handle: `e2e-hc-${run}`,
      fanId: `usr_e2e_hc_fan_${run}`,
      fanEmail: `e2e-hc-fan-${run}@example.test`,
      newcomerId: `usr_e2e_hc_new_${run}`,
      newcomerEmail: `e2e-hc-new-${run}@example.test`,
    };
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    if (!chris || !jordan || !profile) throw new Error('The seeded people are missing');
    const now = new Date();
    await db.insert(users).values([
      { ...jordan, id: cast.helperId, email: cast.helperEmail, emailVerified: true, name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: cast.helperPhone, phoneVerifiedAt: now, status: 'active', contactSharing: 'none', directMessages: 'everyone' },
      { ...chris, id: cast.fanId, email: cast.fanEmail, name: 'Fay F.', firstName: 'Fay', lastName: 'Fox', phone: null, phoneVerifiedAt: null, status: 'active' },
      { ...chris, id: cast.newcomerId, email: cast.newcomerEmail, name: 'Ned N.', firstName: 'Ned', lastName: 'Nash', phone: null, phoneVerifiedAt: null, status: 'active' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: cast.handle, status: 'active', foundingNumber: null, completedCount: 0 });
    // 402 visible posts over 134 earlier days (3 a day count): 2,010 earned Sparks, a Pillar.
    await db.insert(communityPosts).values(Array.from({ length: 402 }, (_, n) => {
      const createdAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (Math.floor(n / 3) + 1), 12, n % 3));
      return { id: `cpo_e2e_hc_${run}_${n}`, marketId: 'mkt_austin', authorUserId: cast.fanId, kind: 'tip', title: `Tip ${n}`, body: 'A useful tip for neighbors.', status: 'visible', createdAt, lastActivityAt: createdAt, updatedAt: createdAt };
    }));
    return cast;
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.helperId, cast.fanId, cast.newcomerId];
    await db.delete(communityPosts).where(inArray(communityPosts.authorUserId, people));
    await db.delete(auditLog).where(inArray(auditLog.actorId, people));
    await db.delete(rateLimits).where(like(rateLimits.key, `helper-contact-reveal:usr_e2e_hc_%_${cast.run}`));
    // The people stay (sessions point at them), on no list: the profile goes, and the number is freed.
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    await db.update(users).set({ status: 'deleted', phone: null, phoneVerifiedAt: null }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

test('a helper shares their email and phone, a Pillar sees them with Show, and nobody else does', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    // The helper chooses what their profile shares, on the account page.
    await devSignIn(page, cast.helperEmail);
    await page.goto('/app/account');
    await openAccountGroup(page, 'privacy');
    const both = page.getByRole('radio', { name: /^My email and phone number/ });
    await expect(page.getByRole('radio', { name: /^Don’t share/ })).toBeChecked({ timeout: 30_000 });
    await both.check();
    await expect(both).toBeChecked();
    await expect.poll(async () => {
      await page.reload();
      await openAccountGroup(page, 'privacy');
      return page.getByRole('radio', { name: /^My email and phone number/ }).isChecked();
    }, { timeout: 30_000 }).toBe(true);

    // A Pillar (2,010 earned Sparks): "Show" gives the email and the number, and it's on record.
    const fanContext = await browser.newContext();
    try {
      const fan = await fanContext.newPage();
      await devSignIn(fan, cast.fanEmail);
      await fan.goto(`/helpers/${cast.handle}`);
      const panel = fan.getByRole('region', { name: 'Contact details' });
      await expect(panel).toContainText('Hal H. shares their email and phone number with neighbors who’ve earned a top Sparks level, like you.', { timeout: 30_000 });
      await expect(panel.getByText(cast.helperEmail)).toHaveCount(0);
      await panel.getByRole('button', { name: 'Show email and phone' }).click();
      await expect(panel.getByRole('link', { name: `Email: ${cast.helperEmail}` })).toHaveAttribute('href', `mailto:${cast.helperEmail}`, { timeout: 30_000 });
      await expect(panel.getByRole('link', { name: /^Phone: \(512\) 555-/ })).toHaveAttribute('href', `tel:${cast.helperPhone}`);
      const { db, pool } = database();
      try {
        const seen = await db.select().from(auditLog).where(and(eq(auditLog.actorId, cast.fanId), eq(auditLog.action, 'helper_contact.revealed')));
        expect(seen.map((row) => row.targetId)).toEqual([cast.helperId]);
      } finally {
        await pool.end();
      }
    } finally {
      await fanContext.close();
    }

    // A newcomer sees how far they are, with no way to show; a visitor sees no panel at all.
    const newcomerContext = await browser.newContext();
    try {
      const newcomer = await newcomerContext.newPage();
      await devSignIn(newcomer, cast.newcomerEmail);
      await newcomer.goto(`/helpers/${cast.handle}`);
      const panel = newcomer.getByRole('region', { name: 'Contact details' });
      await expect(panel.getByText('You’ve earned 0 of 2,000.')).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('button')).toHaveCount(0);
    } finally {
      await newcomerContext.close();
    }
    const visitorContext = await browser.newContext();
    try {
      const visitor = await visitorContext.newPage();
      await visitor.goto(`/helpers/${cast.handle}`);
      await expect(visitor.getByRole('heading', { level: 1, name: 'Hal H.' })).toBeVisible({ timeout: 30_000 });
      await expect(visitor.getByRole('region', { name: 'Contact details' })).toHaveCount(0);
    } finally {
      await visitorContext.close();
    }
  } finally {
    await removeCast(cast);
  }
});
