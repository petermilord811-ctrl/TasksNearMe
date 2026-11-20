/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/contracts';
import { PushDeviceGuard } from './push-device-guard';
import { forgetThisPushDevice, PUSH_DEVICE_EVENT } from './use-push-device';

/** A browser with a push subscription (jsdom has no service workers). */
function withSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/guard') {
  const subscription = { endpoint, unsubscribe: vi.fn(async () => true) };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } });
  return subscription;
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe("this device's notifications follow whoever is signed in (sweep MN5)", () => {
  it("lets go of another account's subscription, and tells the device's switch", async () => {
    const subscription = withSubscription();
    const changed = vi.fn();
    window.addEventListener(PUSH_DEVICE_EVENT, changed);
    const onCheck = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_found' }));
    render(<PushDeviceGuard viewerId="usr_guard_one" onCheck={onCheck} />);
    await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalledOnce());
    expect(onCheck).toHaveBeenCalledExactlyOnceWith({ endpoint: subscription.endpoint });
    expect(changed).toHaveBeenCalledOnce();
    window.removeEventListener(PUSH_DEVICE_EVENT, changed);
  });

  it("keeps this person's own, and checks once a page load for each person", async () => {
    const subscription = withSubscription();
    const onCheck = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    const view = render(<PushDeviceGuard viewerId="usr_guard_two" onCheck={onCheck} />);
    await waitFor(() => expect(onCheck).toHaveBeenCalledOnce());
    view.rerender(<PushDeviceGuard viewerId="usr_guard_two" onCheck={onCheck} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onCheck).toHaveBeenCalledOnce();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('takes the device off the account, then lets go of it, when signing out', async () => {
    const subscription = withSubscription('https://fcm.googleapis.com/fcm/send/leaving');
    const order: string[] = [];
    subscription.unsubscribe.mockImplementation(async () => { order.push('unsubscribe'); return true; });
    const onForget = vi.fn(async (): Promise<ActionResult> => { order.push('forget'); return { ok: true, code: 'updated' }; });
    await forgetThisPushDevice(onForget);
    expect(onForget).toHaveBeenCalledExactlyOnceWith({ endpoint: 'https://fcm.googleapis.com/fcm/send/leaving' });
    expect(order).toEqual(['forget', 'unsubscribe']);
    // A browser without push, or a failing call, never stands in the way of signing out.
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await expect(forgetThisPushDevice(onForget)).resolves.toBeUndefined();
    withSubscription().unsubscribe.mockRejectedValue(new Error('push service down'));
    await expect(forgetThisPushDevice(vi.fn(async (): Promise<ActionResult> => { throw new Error('offline'); }))).resolves.toBeUndefined();
  });
});
