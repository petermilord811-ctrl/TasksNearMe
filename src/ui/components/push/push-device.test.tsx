/** @vitest-environment jsdom */
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

  it('never prompts where the browser can\'t', async () => {
    const { container } = mount(<PushPrompt push={samplePushSetup} onSave={handlers.onSavePushSubscription} kind="offers" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
