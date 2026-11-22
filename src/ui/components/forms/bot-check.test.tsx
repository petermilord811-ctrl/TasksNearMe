/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import uiMessages from '../../../../messages/en/ui';
import { BOT_CHECK_SLOW_MS, BOT_CHECK_WAIT_MS, BotCheckField, isFinalTurnstileError, useBotCheck, type BotCheckAnswer } from './bot-check';

/**
 * Turnstile's `interaction-only` frame shows nothing until Cloudflare wants a click, yet it kept about 72 px of the form
 * (f7's visual pass of the live site, 2026-11-18). The frame takes room only once Cloudflare asks for the person, or when
 * a check runs long without a token. A line under it always says where the check stands, and a form waits for a check
 * still running instead of sending without its token (owner, 2026-11-22). Cloudflare's script is a stand-in here that
 * keeps the options it was given.
 */

type Callbacks = Record<'callback' | 'before-interactive-callback' | 'error-callback' | 'expired-callback' | 'unsupported-callback', (value?: string) => void>;
let given: Callbacks;
const turnstile = {
  render: vi.fn((_container: HTMLElement, options: Record<string, unknown>) => {
    given = options as unknown as Callbacks;
    return 'widget-1';
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};
const status = uiMessages.forms.botCheck.status;

beforeEach(() => { window.turnstile = turnstile; });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  delete window.turnstile;
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((script) => script.remove());
});

function Form({ onAnswer }: { onAnswer?: (answer: BotCheckAnswer) => void }) {
  const check = useBotCheck({ provider: 'turnstile', siteKey: 'test-site-key' }, 'sign_up');
  return <>
    <BotCheckField check={check} />
    <p>{check.token ? `token ${check.token}` : 'no token'}</p>
    <button type="button" onClick={check.reset}>Send</button>
    <button type="button" onClick={async () => onAnswer?.(await check.ready())}>Submit</button>
  </>;
}

async function renderForm(props: { onAnswer?: (answer: BotCheckAnswer) => void } = {}) {
  const view = render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={uiMessages}><Form {...props} /></NextIntlClientProvider>);
  // Cloudflare's script is "loaded": the widget renders once the promise settles.
  await act(async () => {});
  return view;
}

function frameOf(view: ReturnType<typeof render>) {
  const frame = view.container.querySelector('[data-slot="bot-check-widget"]');
  if (!frame) throw new Error('no bot check widget');
  return frame;
}

const statusLine = (view: ReturnType<typeof render>) => view.container.querySelector('[data-slot="bot-check-status"]');

describe('the bot check frame', () => {
  it('takes no room until Cloudflare asks for a click, then stays for that round', async () => {
    const view = await renderForm();
    expect(turnstile.render).toHaveBeenCalledOnce();
    const frame = frameOf(view);
    expect(frame).toHaveAttribute('data-open', 'false');

    act(() => given['before-interactive-callback']());
    expect(frame).toHaveAttribute('data-open', 'true');
    expect(screen.getByText(status.interactive)).toBeInTheDocument();
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

  it('shows a check that runs long without a token, says so with a way to try again, and folds once the token comes', async () => {
    vi.useFakeTimers();
    const view = await renderForm();
    const frame = frameOf(view);
    act(() => vi.advanceTimersByTime(BOT_CHECK_SLOW_MS - 1));
    expect(frame).toHaveAttribute('data-open', 'false');
    expect(screen.getByText(status.checking)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(frame).toHaveAttribute('data-open', 'true');
    expect(screen.getByText(status.slow)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: status.retry })).toBeInTheDocument();
    act(() => given.callback('token-2'));
    expect(frame).toHaveAttribute('data-open', 'false');
    expect(screen.getByText(status.passed)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: status.retry })).toBeNull();
  });

  it('stays closed when the token comes in time', async () => {
    vi.useFakeTimers();
    const view = await renderForm();
    act(() => given.callback('token-3'));
    act(() => vi.advanceTimersByTime(BOT_CHECK_SLOW_MS * 2));
    expect(frameOf(view)).toHaveAttribute('data-open', 'false');
  });
});

describe('a form waiting for the check', () => {
  it('gets the token at once when the check has passed', async () => {
    const answers: BotCheckAnswer[] = [];
    await renderForm({ onAnswer: (answer) => answers.push(answer) });
    act(() => given.callback('token-4'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); });
    expect(answers).toEqual([{ botCheck: 'token-4' }]);
  });

  it('waits for a check still running, saying so, and goes on with the token once it passes', async () => {
    const answers: BotCheckAnswer[] = [];
    await renderForm({ onAnswer: (answer) => answers.push(answer) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); });
    expect(answers).toEqual([]);
    expect(screen.getByText(status.waiting)).toBeInTheDocument();
    await act(async () => { given.callback('token-5'); });
    expect(answers).toEqual([{ botCheck: 'token-5' }]);
    expect(screen.getByText(status.passed)).toBeInTheDocument();
  });

  it('gives up after the wait and leaves the form as it is, with a way to try again', async () => {
    vi.useFakeTimers();
    const answers: BotCheckAnswer[] = [];
    await renderForm({ onAnswer: (answer) => answers.push(answer) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); });
    await act(async () => { vi.advanceTimersByTime(BOT_CHECK_WAIT_MS); });
    expect(answers).toEqual([null]);
    expect(screen.getByText(status.slow)).toBeInTheDocument();

    // "Try again" makes the widget again.
    fireEvent.click(screen.getByRole('button', { name: status.retry }));
    await act(async () => {});
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
    expect(turnstile.render).toHaveBeenCalledTimes(2);
    expect(screen.getByText(status.checking)).toBeInTheDocument();
  });
});

describe('when Cloudflare has a problem', () => {
  it('says it is trying again on an error Turnstile retries, and passes when a retry does', async () => {
    await renderForm();
    act(() => given['error-callback']('300030'));
    expect(screen.getByText(status.retrying)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: status.retry })).toBeNull();
    act(() => given.callback('token-6'));
    expect(screen.getByText(status.passed)).toBeInTheDocument();
  });

  it('fails at once on an error waiting won’t fix, and a waiting form stops waiting', async () => {
    const answers: BotCheckAnswer[] = [];
    await renderForm({ onAnswer: (answer) => answers.push(answer) });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); });
    await act(async () => { given['error-callback']('110200'); });
    expect(answers).toEqual([null]);
    expect(screen.getByText(status.failed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: status.retry })).toBeInTheDocument();
    // A failed check doesn't keep the next submit waiting either.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); });
    expect(answers).toEqual([null, null]);
  });

  it('says so when the browser can’t run it', async () => {
    await renderForm();
    act(() => given['unsupported-callback']());
    expect(screen.getByText(status.unsupported)).toBeInTheDocument();
  });

  it('says so when Cloudflare’s script doesn’t load, and loads it again on "Try again"', async () => {
    delete window.turnstile;
    await renderForm();
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    expect(script).not.toBeNull();
    await act(async () => { script!.onerror?.(new Event('error')); });
    expect(screen.getByText(status.failed)).toBeInTheDocument();
    expect(turnstile.render).not.toHaveBeenCalled();

    window.turnstile = turnstile;
    fireEvent.click(screen.getByRole('button', { name: status.retry }));
    await act(async () => {});
    expect(turnstile.render).toHaveBeenCalledOnce();
    expect(screen.getByText(status.checking)).toBeInTheDocument();
  });

  it('tells the errors Turnstile retries from the ones it doesn’t', () => {
    for (const code of ['110100', '110110', '110200', 110500, '400020', '400070', '200100']) expect(isFinalTurnstileError(code)).toBe(true);
    for (const code of ['110600', '110620', '200500', '300030', '600010', 'nonsense', undefined]) expect(isFinalTurnstileError(code)).toBe(false);
  });
});

describe('the line under the form', () => {
  it('shows nothing for the stand-in, while the server’s answer still shows', () => {
    function StandIn() {
      const check = useBotCheck({ provider: 'stand_in' }, 'sign_up');
      return <BotCheckField check={check} result={{ ok: false, code: 'validation_failed', fieldErrors: { botCheck: ['expired'] } }} />;
    }
    const view = render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={uiMessages}><StandIn /></NextIntlClientProvider>);
    expect(statusLine(view)).toBeNull();
    expect(screen.getByText(uiMessages.forms.botCheck.expired)).toBeInTheDocument();
  });

  it('drops the server’s refusal once a new token is in', async () => {
    function Refused() {
      const check = useBotCheck({ provider: 'turnstile', siteKey: 'test-site-key' }, 'sign_up');
      return <BotCheckField check={check} result={{ ok: false, code: 'validation_failed', fieldErrors: { botCheck: ['invalid'] } }} />;
    }
    const view = render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={uiMessages}><Refused /></NextIntlClientProvider>);
    await act(async () => {});
    expect(screen.getByText(uiMessages.forms.botCheck.failed)).toBeInTheDocument();
    expect(statusLine(view)).toHaveAttribute('data-status', 'checking');
    act(() => given.callback('token-7'));
    expect(screen.queryByText(uiMessages.forms.botCheck.failed)).toBeNull();
    expect(statusLine(view)).toHaveAttribute('data-status', 'passed');
  });
});
