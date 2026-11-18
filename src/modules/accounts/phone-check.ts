import { eq, sql } from 'drizzle-orm';
import { smsAvailable } from '@/integrations/sms';
import { communityPosts } from '@/modules/community/schema';
import { tasks } from '@/modules/tasks/schema';
import { identityCaptures, identityVerifications } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';
import { users } from './schema';

/**
 * Whether the phone check applies (completion plan 9.2; decisions.md 2026-11-18). A verified phone used to come
 * before posting, offering, booking, a community post and a helper's ID check; it can only be checked where texts
 * go out.
 * - `off`: no SMS provider here (a production build without Twilio). Nothing asks for a phone number or a code, and
 *   nothing needs one: not sign-in, posting, community posts, helper setup, bookability, badges or the account page.
 * - `asked`: texts work, but the person already used the site without a phone while they didn't (the grace): they
 *   posted a task or a community post, or started their ID check. We ask for the phone and never block on it.
 * - `required`: texts work and the phone comes first, as before.
 * A verified phone always counts (the badge, texts), whatever the mode.
 */
export type PhoneCheck = 'off' | 'asked' | 'required';

export function phoneCheckOf(sms: boolean, usedWithoutPhone: boolean): PhoneCheck {
  if (!sms) return 'off';
  return usedWithoutPhone ? 'asked' : 'required';
}

/** Whether what the phone gates may go ahead: a verified phone, or a check that doesn't block. */
export function phoneGatePasses(check: PhoneCheck, phoneVerified: boolean): boolean {
  return phoneVerified || check !== 'required';
}

/**
 * The person's phone check and whether their phone is verified. Only someone without a verified phone needs the
 * grace lookup: before 9.2 each of those things needed a verified phone, so having done one without it means texts
 * weren't set up then.
 */
export async function loadPhoneCheck(db: Db, userId: string, env: Record<string, string | undefined> = process.env): Promise<{ check: PhoneCheck; verified: boolean }> {
  const [user] = await db.select({ phoneVerifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  const verified = Boolean(user?.phoneVerifiedAt);
  const sms = smsAvailable(env);
  if (!sms || verified) return { check: phoneCheckOf(sms, false), verified };
  const [row] = await db
    .select({
      used: sql<boolean>`(
        exists (select 1 from ${tasks} where ${tasks.posterUserId} = ${users.id})
        or exists (select 1 from ${communityPosts} where ${communityPosts.authorUserId} = ${users.id})
        or exists (select 1 from ${identityVerifications} where ${identityVerifications.userId} = ${users.id})
        or exists (select 1 from ${identityCaptures} where ${identityCaptures.userId} = ${users.id})
      )`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { check: phoneCheckOf(sms, row?.used === true), verified };
}
