import { eq } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';

/** A helper's public handle ("priya-s", then "priya-s-2"…), unique among profiles. */
export async function uniqueHandle(db: Db, firstName: string, lastName: string): Promise<string> {
  const base = `${firstName}-${lastName.charAt(0)}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '') || 'helper';
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db.select({ id: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.handle, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The draft helper profile, created when the first part of setup is saved (plan 9.11: services and area can come
 * before the headline and about me), or when a check is the first thing the helper does (owner, 2026-11-27: checks in
 * any order, before the profile). A draft is invisible to clients until setup makes it active.
 */
export async function ensureDraftProfile(db: Db, userId: string): Promise<boolean> {
  const [existing] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (existing) return true;
  const [user] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;
  await db.insert(helperProfiles).values({ userId, handle: await uniqueHandle(db, user.firstName, user.lastName), status: 'draft' }).onConflictDoNothing();
  // Starting helper setup is choosing to help (journeys on a phone, J-H3): Home then leads with setup's next step and every
  // page links back to it. Someone who came from Become a helper through sign-in stayed in client mode, so Home said
  // "You're all caught up" halfway through their checks. Once, as the draft starts: the mode switch turns it back.
  await db.update(users).set({ mode: 'helper' }).where(eq(users.id, userId));
  return true;
}
