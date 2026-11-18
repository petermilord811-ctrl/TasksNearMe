/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import uiMessages from '../../../../messages/en/ui';
import { BOT_CHECK_SLOW_MS, BotCheckField, useBotCheck } from './bot-check';

/**
 * Turnstile's `interaction-only` frame shows nothing until Cloudflare wants a click, yet it kept about 72 px of the form
 * (f7's visual pass of the live site, 2026-11-18). The frame takes room only once Cloudflare asks for the person, or when
 * a check runs long without a token. Cloudflare's script is a stand-in here that keeps the options it was given.
 */

type Callbacks = Record<'callback' | 'before-interactive-callback', (token?: string) => void>;
let given: Callbacks;
const turnstile = {
  render: vi.fn((_container: HTMLElement, options: Record<string, unknown>) => {
    given = options as unknown as Callbacks;
    return 'widget-1';
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => { window.turnstile = turnstile; });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  delete window.turnstile;
});

function Form() {
  const check = useBotCheck({ provider: 'turnstile', siteKey: 'test-site-key' }, 'sign_up');
  return <>
    <BotCheckField check={check} />
    <p>{check.token ? `token ${check.token}` : 'no token'}</p>
    <button type="button" onClick={check.reset}>Send</button>
  </>;
}

async function renderForm() {
  const view = render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={uiMessages}><Form /></NextIntlClientProvider>);
  // Cloudflare's script is "loaded": the widget renders once the promise settles.
  await act(async () => {});
  expect(turnstile.render).toHaveBeenCalledOnce();
  const frame = view.container.querySelector('[data-slot="bot-check-widget"]');
  if (!frame) throw new Error('no bot check widget');
  return frame;
}

describe('the bot check frame', () => {
  it('takes no room until Cloudflare asks for a click, then stays for that round', async () => {
    const frame = await renderForm();
    expect(frame).toHaveAttribute('data-open', 'false');

    act(() => given['before-interactive-callback']());
    expect(frame).toHaveAttribute('data-open', 'true');
    // Passed: the frame stays (its tick), so nothing under it moves.
    act(() => given.callback('token-1'));
    expect(screen.getByText('token token-1')).toBeInTheDocument();
    expect(frame).toHaveAttribute('data-open', 'true');

    // After a submit there's a new round: closed until Cloudflare asks again.
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
    expect(screen.getByText('no token')).toBeInTheDocument();
    expect(frame).toHaveAttribute('data-open', 'false');
  });

  it('shows a check that runs long without a token, and folds it once the token comes', async () => {
    vi.useFakeTimers();
    const frame = await renderForm();
    act(() => vi.advanceTimersByTime(BOT_CHECK_SLOW_MS - 1));
    expect(frame).toHaveAttribute('data-open', 'false');
    act(() => vi.advanceTimersByTime(1));
    expect(frame).toHaveAttribute('data-open', 'true');
    act(() => given.callback('token-2'));
    expect(frame).toHaveAttribute('data-open', 'false');
  });

  it('stays closed when the token comes in time', async () => {
    vi.useFakeTimers();
    const frame = await renderForm();
    act(() => given.callback('token-3'));
    act(() => vi.advanceTimersByTime(BOT_CHECK_SLOW_MS * 2));
    expect(frame).toHaveAttribute('data-open', 'false');
  });
});
