/** @vitest-environment jsdom */
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushHandlers, PushSubscriptionInput } from '@/contracts';
import { fakeHandler, samplePushSetup } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import push from '../../../../messages/en/ui/push.json';
import { PushDeviceSetting, PushPrompt } from './push-device';

afterEach(cleanup);
const handlers: PushHandlers = { onSavePushSubscription: vi.fn(fakeHandler<PushSubscriptionInput>({ ok: true, code: 'updated' }, 0)), onRemovePushSubscription: vi.fn(fakeHandler<{ endpoint: string }>({ ok: true, code: 'updated' }, 0)) };
const mount = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>);

describe('notifications on this device', () => {
  it("says when push isn't set up here", async () => {
    mount(<PushDeviceSetting handlers={handlers} />);
    expect(await screen.findByText(push.device.notSetUp)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it("says when this browser can't, and offers nothing to press", async () => {
    // jsdom has no service workers or push manager.
    mount(<PushDeviceSetting push={samplePushSetup} handlers={handlers} />);
    expect(await screen.findByText(push.device.unsupported)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(handlers.onSavePushSubscription).not.toHaveBeenCalled();
  });

  it("draws the not-set-up line from the server where there's no key: nothing to check, so nothing changes", () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<NextIntlClientProvider locale="en" messages={messages}><PushDeviceSetting handlers={handlers} /></NextIntlClientProvider>);
    expect(container.textContent).toContain(push.device.notSetUp);
    expect(container.querySelector('button')).toBeNull();
  });

  it('keeps the button’s place while it checks this device, so nothing below moves once it knows', async () => {
    // A browser that can (a service worker, push, notifications not asked yet) and isn't subscribed: the check says off.
    // Before, the server drew no button and the answer added one just after the page hydrated, under a press below.
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', class PushManager {});
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(async () => undefined) } });
    const tree = <NextIntlClientProvider locale="en" messages={messages}><PushDeviceSetting push={samplePushSetup} handlers={handlers} /></NextIntlClientProvider>;
    const container = document.body.appendChild(document.createElement('div'));
    let root = null as Root | null;
    try {
      container.innerHTML = renderToString(tree);
      // The card's rows and what sizes them (no layout in jsdom); `invisible` keeps a row's space, so it isn't counted.
      const rows = () => [...container.firstElementChild!.children].map((row) => `${row.tagName} ${row.className.replace(/\binvisible\b/, '').replace(/\s+/g, ' ').trim()}`);
      const server = rows();
      const held = container.querySelector('button');
      const heldInServerHtml = { invisible: held?.classList.contains('invisible'), disabled: held?.hasAttribute('disabled') };
      expect(container.textContent).toContain(push.device.checking);
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      expect(await screen.findByText(push.device.off)).toBeInTheDocument();
      expect(rows(), "the card's rows once the check has answered").toEqual(server);
      // The place was the button's own, hidden and off until the answer.
      expect(heldInServerHtml).toEqual({ invisible: true, disabled: true });
      expect(screen.getByRole('button', { name: push.device.turnOn })).toBeEnabled();
    } finally {
      act(() => root?.unmount());
      container.remove();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('never prompts where the browser can\'t', async () => {
    const { container } = mount(<PushPrompt push={samplePushSetup} onSave={handlers.onSavePushSubscription} kind="offers" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
