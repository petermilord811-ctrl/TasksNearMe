/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import enFeedback from '../../../../messages/en/ui/feedback.json';
import { AppToaster } from './app-toaster';
import { isPagePush, pushPath, takePagePush } from './push-toasts';

const worker = new EventTarget();

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
});

let visibility: DocumentVisibilityState = 'visible';
beforeEach(() => {
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
  vi.restoreAllMocks();
});

function app() {
  return render(<NextIntlClientProvider locale="en" messages={{ feedback: enFeedback }}><AppToaster /></NextIntlClientProvider>);
}

/** What public/sw.js posts, with the port it waits on for the answer. */
function post(data: unknown) {
  const reply = { postMessage: vi.fn() };
  act(() => {
    worker.dispatchEvent(Object.assign(new Event('message'), { data, ports: [reply] }));
  });
  return reply;
}

const push = (path: string) => ({ type: 'tnm:push', title: 'New message from Maya', body: 'Maya: see you at 3', url: `${window.location.origin}${path}`, tag: 'thr_1' });

describe('pushes while a page is in front (owner, 2026-11-24)', () => {
  it('show as a card in the app’s look that opens the page, and the service worker hears they showed', async () => {
    app();
    const reply = post(push('/app/messages/thr_1'));
    const link = await screen.findByRole('link', { name: /New message from Maya/ });
    expect(link.getAttribute('href')).toBe('/app/messages/thr_1');
    expect(screen.getByText('Maya: see you at 3')).toBeDefined();
    expect(reply.postMessage).toHaveBeenCalledWith({ shown: true });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /New message from Maya/ })).toBeNull());
  });

  it('a newer push about the same thread replaces its card', async () => {
    app();
    post(push('/app/messages/thr_1'));
    await screen.findByText('Maya: see you at 3');
    post({ ...push('/app/messages/thr_1'), body: 'Maya: running late' });
    await screen.findByText('Maya: running late');
    expect(screen.queryByText('Maya: see you at 3')).toBeNull();
    expect(document.querySelectorAll('[data-push-toast]')).toHaveLength(1);
  });

  it('about the page that is open, nothing shows, and it still counts as shown', () => {
    app();
    const reply = post(push(window.location.pathname));
    expect(document.querySelector('[data-push-toast]')).toBeNull();
    expect(reply.postMessage).toHaveBeenCalledWith({ shown: true });
  });

  it('in a hidden tab, the page says no, so the device notification shows instead', () => {
    app();
    visibility = 'hidden';
    const reply = post(push('/app/messages/thr_1'));
    expect(document.querySelector('[data-push-toast]')).toBeNull();
    expect(reply.postMessage).toHaveBeenCalledWith({ shown: false });
  });

  it('ignores other messages from the service worker', () => {
    app();
    const reply = post({ type: 'something-else' });
    expect(reply.postMessage).not.toHaveBeenCalled();
  });
});

describe('push helpers', () => {
  it('takes only well-formed pushes', () => {
    expect(isPagePush(push('/app'))).toBe(true);
    expect(isPagePush({ ...push('/app'), tag: undefined })).toBe(true);
    expect(isPagePush({ ...push('/app'), title: 3 })).toBe(false);
    expect(isPagePush({ ...push('/app'), type: 'push' })).toBe(false);
    expect(isPagePush(null)).toBe(false);
  });

  it('opens only this site’s pages', () => {
    expect(pushPath('https://tasksnearme.com/app/bookings/bk_1?tab=chat#end', 'https://tasksnearme.com')).toBe('/app/bookings/bk_1?tab=chat#end');
    expect(pushPath('https://evil.example/app', 'https://tasksnearme.com')).toBe('/app');
    expect(pushPath('/app/tasks', 'https://tasksnearme.com')).toBe('/app/tasks');
    expect(pushPath('http://[bad', 'https://tasksnearme.com')).toBe('/app');
  });

  it('compares the open page in either language', () => {
    const show = vi.fn();
    const base = { type: 'tnm:push' as const, title: 'T', body: 'B', url: 'https://t.test/app/messages/thr_1?from=push' };
    expect(takePagePush(base, { origin: 'https://t.test', path: '/es/app/messages/thr_1', visible: true }, show)).toBe(true);
    expect(show).not.toHaveBeenCalled();
    expect(takePagePush(base, { origin: 'https://t.test', path: '/app/messages', visible: true }, show)).toBe(true);
    expect(show).toHaveBeenCalledWith('/app/messages/thr_1?from=push');
    expect(takePagePush(base, { origin: 'https://t.test', path: '/app', visible: false }, show)).toBe(false);
  });
});
