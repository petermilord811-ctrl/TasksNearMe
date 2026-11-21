import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFault, currentFaults, ProviderFaultError, setFault } from './faults';

const helpers = vi.hoisted(() => ({ on: true }));
vi.mock('@/shared/dev-helpers', () => ({ devHelpersOn: () => helpers.on }));
afterEach(() => {
  for (const kind of ['email', 'sms', 'payments'] as const) setFault(kind, null);
  helpers.on = true;
  vi.useRealTimers();
});

describe('provider faults on purpose (when things break, 2026-11-21)', () => {
  it('makes a stand-in fail at once (down), or after the real provider’s timeout (slow), until cleared', async () => {
    await expect(applyFault('email')).resolves.toBeUndefined();
    setFault('email', 'down');
    expect(currentFaults()).toEqual({ email: 'down' });
    await expect(applyFault('email')).rejects.toThrow(new ProviderFaultError('email', 'down'));
    await expect(applyFault('sms')).resolves.toBeUndefined();

    vi.useFakeTimers();
    setFault('payments', 'slow');
    const charged = applyFault('payments');
    const caught = charged.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(29_999);
    let settled = false;
    void caught.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await caught).toEqual(new ProviderFaultError('payments', 'slow'));
    expect(String(await caught)).toContain("didn't answer in 30 s");

    setFault('email', null);
    await expect(applyFault('email')).resolves.toBeUndefined();
  });

  it('does nothing in a build without the development helpers', async () => {
    setFault('email', 'down');
    helpers.on = false;
    await expect(applyFault('email')).resolves.toBeUndefined();
  });
});
