import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Whether a code Better Auth was asked to send went out (when things break, 2026-11-21). Better Auth runs our
 * `sendVerificationOTP` and swallows its error (it logs it and answers as if sent: `runInBackgroundOrAwait`), so an
 * email outage said "We sent a 6-digit code" and nothing came. An action asks inside `trackCodeDelivery`; the send marks
 * a failure with `noteCodeNotSent`; the action answers `unavailable` instead of moving on to the code.
 */
const delivery = new AsyncLocalStorage<{ failed: boolean }>();

export async function trackCodeDelivery(ask: () => Promise<unknown>): Promise<{ sent: boolean }> {
  const state = { failed: false };
  await delivery.run(state, ask);
  return { sent: !state.failed };
}

/** Called where the code is sent, when the provider refused it or didn't answer. Outside a tracked request: nothing. */
export function noteCodeNotSent(): void {
  const state = delivery.getStore();
  if (state) state.failed = true;
}
