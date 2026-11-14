'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { routes } from '@/contracts';
import { isLocalRequest } from '@/shared/local-request';
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
  const target = String(formData.get('target') ?? routes.app.home());

  await serialize(email, async () => {
    const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
    await auth.api.signInEmailOTP({ body: { email, otp }, headers: requestHeaders });
  });

  redirect(target.startsWith('/') ? target : routes.app.home());
}
