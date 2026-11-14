'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { routes } from '@/contracts';
import { safeNextPath } from '@/modules/accounts/sign-in/steps';
import { isLocalRequest } from '@/shared/local-request';
import { staffRoles, users } from '@/modules/accounts/schema';
import { db } from '@/platform/db/client';
import { auth } from './auth';
import { devHelpersOn } from '@/shared/dev-helpers';

/** One email code exists per person at a time, so sign-ins for the same email run one after another. */
const queues = new Map<string, Promise<unknown>>();

function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
  queues.set(key, run);
  return run;
}

/**
 * Development only: signs in as a seeded person through the real email-code verification
 * (the code is created server-side instead of emailed). Refuses to run in production.
 */
export async function devSignInAs(formData: FormData): Promise<void> {
  if (!devHelpersOn()) throw new Error('Not available in production.');
  const requestHeaders = await headers();
  // Only on this machine: a dev server behind a public proxy must not sign strangers in as anyone.
  if (!isLocalRequest((name) => requestHeaders.get(name))) throw new Error('Only available on this machine.');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const given = formData.get('target');
  const target = given ? String(given) : await landingFor(email);

  await serialize(email, async () => {
    const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
    await auth.api.signInEmailOTP({ body: { email, otp }, headers: requestHeaders });
  });

  // Same-site paths only (one leading slash, no scheme, no backslash): never another host (5.18).
  redirect(safeNextPath(target));
}

/** Where the email form lands someone: staff at the two-step check, everyone else at the app home. */
async function landingFor(email: string): Promise<string> {
  const [staff] = await db
    .select({ userId: staffRoles.userId })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    .where(eq(users.email, email))
    .limit(1);
  return staff ? routes.admin.verify() : routes.app.home();
}
