import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * public/sw.js on a push (owner, 2026-11-24): a TasksNearMe page in front shows it as its own toast; otherwise, when
 * that page doesn't answer, and always on WebKit (which ends subscriptions whose pushes show nothing), the device's
 * notification shows.
 */

const SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';

const ports: MessagePort[] = [];
afterEach(() => {
  ports.splice(0).forEach((port) => port.close());
  vi.useRealTimers();
});

type Answer = 'shown' | 'declined' | 'silent';

function page(answer: Answer, front = true) {
  const posted: unknown[] = [];
  return {
    posted,
    client: {
      focused: front,
      visibilityState: front ? 'visible' : 'hidden',
      postMessage(message: unknown, transfer: MessagePort[]) {
        posted.push(message);
        const port = transfer[0]!;
        ports.push(port);
        if (answer !== 'silent') port.postMessage({ shown: answer === 'shown' });
      },
    },
  };
}

function worker(agent: string, clients: unknown[]) {
  const handlers = new Map<string, (event: unknown) => void>();
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const self = {
    navigator: { userAgent: agent },
    location: { origin: 'https://tasksnearme.test' },
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    skipWaiting() {},
    clients: { matchAll: async () => clients, claim: async () => undefined, openWindow: async () => undefined },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void notifications.push({ title, options }) },
  };
  // The channel each push opens is closed after each test.
  class TrackedChannel extends MessageChannel {
    constructor() {
      super();
      ports.push(this.port1);
    }
  }
  runInNewContext(SOURCE, { self, MessageChannel: TrackedChannel, setTimeout, clearTimeout, URL, Promise });
  const push = (data: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.get('push')!({ data: { json: () => data, text: () => JSON.stringify(data) }, waitUntil: (work: Promise<unknown>) => { done = work; } });
    return done;
  };
  return { push, notifications };
}

const message = { title: 'New message from Maya', body: 'Maya: see you at 3', url: 'https://tasksnearme.test/app/messages/thr_1', tag: 'thr_1' };

describe('a push', () => {
  it('goes to the page in front, which shows it: no device notification', async () => {
    const front = page('shown');
    const { push, notifications } = worker(CHROME, [front.client]);
    await push(message);
    expect(front.posted).toEqual([{ type: 'tnm:push', ...message }]);
    expect(notifications).toEqual([]);
  });

  it('shows on the device when the page in front declines it (a hidden tab)', async () => {
    const front = page('declined');
    const { push, notifications } = worker(FIREFOX, [front.client]);
    await push(message);
    expect(front.posted).toHaveLength(1);
    expect(notifications).toEqual([{ title: message.title, options: { body: message.body, tag: 'thr_1', icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', data: { url: message.url } } }]);
  });

  it('shows on the device when the page doesn’t answer in time (an old page without the toasts)', async () => {
    vi.useFakeTimers();
    const front = page('silent');
    const { push, notifications } = worker(CHROME, [front.client]);
    const done = push(message);
    await vi.advanceTimersByTimeAsync(1499);
    expect(notifications).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(notifications).toHaveLength(1);
  });

  it('shows on the device with no page in front, and asks no page', async () => {
    const behind = page('shown', false);
    const { push, notifications } = worker(CHROME, [behind.client]);
    await push(message);
    expect(behind.posted).toEqual([]);
    expect(notifications).toHaveLength(1);
  });

  it.each([['an iPhone', IPHONE], ['Safari on a Mac', MAC_SAFARI]])('always shows on the device on %s', async (_name, agent) => {
    const front = page('shown');
    const { push, notifications } = worker(agent, [front.client]);
    await push(message);
    expect(front.posted).toEqual([]);
    expect(notifications).toHaveLength(1);
  });

  it('without a title or a link, still shows the app’s name and opens the app', async () => {
    const { push, notifications } = worker(CHROME, []);
    await push({ body: 'Something happened' });
    expect(notifications[0]).toMatchObject({ title: 'TasksNearMe', options: { body: 'Something happened', data: { url: '/app' } } });
  });
});
