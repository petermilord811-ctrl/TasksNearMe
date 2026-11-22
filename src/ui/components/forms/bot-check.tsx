'use client';

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { preconnect, preload } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { CircleAlert, LoaderCircle, MousePointerClick, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react';
import { BOT_CHECK_STAND_IN_TOKEN, type ActionResult, type BotCheckAction, type BotCheckConfig } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * The bot check on abuse-prone forms (sign-up, posting, offers, support). With Turnstile it renders Cloudflare's
 * widget, which only asks for a click when Cloudflare isn't sure (`interaction-only`), and a line under it that always
 * says where the check stands: running, passed, waiting for a click, retrying, slow or failed, with "Try again" where
 * that helps (owner, 2026-11-22: "I can't see what's happening whether cloudflare will be shown or not").
 *
 * A form takes its token through `ready()`, which waits for a check still running instead of sending the form without
 * one: a slow Cloudflare used to turn a quick "Continue" into "Finish the check above, then try again", with nothing
 * above. The token goes with the form as `botCheck`. With the stand-in (development and tests) the token is there from
 * the start and nothing shows. Tokens work once, so the widget gets a fresh one after each submit (`reset`).
 */

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      scriptPromise = undefined;
      script.remove();
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Where the check stands, for the line under the form. */
export type BotCheckStatus = 'checking' | 'interactive' | 'passed' | 'retrying' | 'slow' | 'failed' | 'unsupported';

/** What a form sends with its input: `{ botCheck }`, `{}` when no check runs here, or null when it can't be sent yet. */
export type BotCheckAnswer = { botCheck?: string } | null;

export interface BotCheckState {
  /** The token to send as `botCheck` (undefined until the check is done). */
  token: string | undefined;
  /** Where the check stands; undefined when nothing shows (the stand-in, or no check on this page). */
  status: BotCheckStatus | undefined;
  /** A submit is waiting for the check to pass (`ready`). */
  waiting: boolean;
  /**
   * The answer to send with the form: at once when the token is in, otherwise once the check passes, waiting up to
   * `BOT_CHECK_WAIT_MS`. Null when there's no token to send (the check failed, or it's still running after the wait):
   * the form stays put and the line says what to do.
   */
  ready: () => Promise<BotCheckAnswer>;
  /** Ask for a new token (after a submit, whatever the result). */
  reset: () => void;
  /** Start the check over (the line's "Try again"): the widget is made again, and the script loaded again if it failed. */
  retry: () => void;
  /** Where the widget goes. */
  widget: React.ReactNode;
}

/** How long a check may run with no token before the line says so and offers to try again (its frame shows too). */
export const BOT_CHECK_SLOW_MS = 10_000;
/** How long a submit waits for the check to pass before it gives up and leaves the form as it is. */
export const BOT_CHECK_WAIT_MS = 30_000;

/**
 * Cloudflare's errors that waiting won't fix, so Turnstile doesn't retry them: the site's key or domain (110100–110599,
 * 400xxx) and a wrong clock or a cached challenge (200100). The others (timeouts, a blocked frame, a failed challenge)
 * Turnstile retries by itself every 8 s.
 */
export function isFinalTurnstileError(code: unknown): boolean {
  const value = Number(code);
  if (!Number.isInteger(value)) return false;
  return (value >= 110100 && value < 110600) || Math.floor(value / 1000) === 400 || value === 200100;
}

type WidgetEvent =
  | { kind: 'token'; token: string }
  | { kind: 'expired' }
  | { kind: 'interactive' }
  | { kind: 'error'; final: boolean }
  | { kind: 'unsupported' }
  | { kind: 'unavailable' };

function TurnstileWidget({ siteKey, action, round, open, onEvent }: { siteKey: string; action: BotCheckAction; round: number; open: boolean; onEvent: (event: WidgetEvent) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>(undefined);
  const locale = useLocale();
  const report = useEffectEvent(onEvent);
  // Fetched with the page's HTML instead of after hydration: Cloudflare asks for the script as early as possible.
  preload(SCRIPT_URL, { as: 'script' });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then((api) => {
      if (cancelled || !container.current) return;
      widgetId.current = api.render(container.current, {
        sitekey: siteKey,
        action,
        theme: 'auto',
        size: 'flexible',
        appearance: 'interaction-only',
        language: locale,
        'response-field': false,
        callback: (token: string) => report({ kind: 'token', token }),
        // Turnstile fetches a fresh token itself (`refresh-expired` and `refresh-timeout` are `auto`).
        'expired-callback': () => report({ kind: 'expired' }),
        'timeout-callback': () => report({ kind: 'expired' }),
        // Retried by Turnstile itself unless final; a falsy return keeps Cloudflare's console warning with the code.
        'error-callback': (code: unknown) => report({ kind: 'error', final: isFinalTurnstileError(code) }),
        'unsupported-callback': () => report({ kind: 'unsupported' }),
        'before-interactive-callback': () => report({ kind: 'interactive' }),
      });
    }, () => { if (!cancelled) report({ kind: 'unavailable' }); });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [siteKey, action, locale]);

  useEffect(() => {
    if (round > 0 && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [round]);

  // `interaction-only` shows nothing until Cloudflare wants a click, yet its frame kept about 72 px of the form, a blank
  // band above "Create account" (f7's visual pass of the live site, 2026-11-18). So the frame stays out of the layout
  // until Cloudflare says it needs the person, and after that for the rest of the round; a check that runs long without
  // a token shows its frame too, so a challenge that never announced itself can't hide. Closed, the frame keeps the
  // form's width (Turnstile's `flexible` size reads it) but takes no height and no room in the flow.
  return <div ref={container} data-slot="bot-check-widget" data-open={open} className={open ? 'min-h-0 empty:hidden' : 'absolute inset-x-0 top-0 h-0 overflow-hidden'} />;
}

type Problem = 'retrying' | 'failed' | 'unsupported' | null;

/** The bot check for one form. `config` absent: nothing to check (the server decides what that means). */
export function useBotCheck(config: BotCheckConfig | undefined, action: BotCheckAction): BotCheckState {
  const siteKey = config?.provider === 'turnstile' ? config.siteKey : undefined;
  const standIn = config?.provider === 'stand_in';
  // The connection to Cloudflare opens with the page, before the widget asks for anything.
  if (siteKey) preconnect(TURNSTILE_ORIGIN);
  const [token, setToken] = useState<string | undefined>(standIn ? BOT_CHECK_STAND_IN_TOKEN : undefined);
  const [problem, setProblem] = useState<Problem>(null);
  const [interactive, setInteractive] = useState(false);
  // Each wait for a token (the first, after a submit, after an expiry, after "Try again") is a run; a run can turn slow.
  const [run, setRun] = useState(0);
  const [slowRun, setSlowRun] = useState(-1);
  const [round, setRound] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const tokenRef = useRef(token);
  const problemRef = useRef<Problem>(null);
  const waiters = useRef(new Set<(value: string | undefined) => void>());

  const settle = useCallback((value: string | undefined) => {
    for (const done of [...waiters.current]) done(value);
  }, []);
  const changeToken = (value: string | undefined) => {
    tokenRef.current = value;
    setToken(value);
  };
  const changeProblem = (value: Problem) => {
    problemRef.current = value;
    setProblem(value);
  };

  useEffect(() => {
    if (!siteKey) return;
    const timer = window.setTimeout(() => setSlowRun(run), BOT_CHECK_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [siteKey, run]);

  // A form that goes away stops waiting.
  useEffect(() => () => settle(undefined), [settle]);

  const onEvent = (event: WidgetEvent) => {
    switch (event.kind) {
      case 'token':
        changeToken(event.token);
        changeProblem(null);
        settle(event.token);
        return;
      case 'expired':
        changeToken(undefined);
        setRun((count) => count + 1);
        return;
      case 'interactive':
        setInteractive(true);
        return;
      case 'error':
        changeToken(undefined);
        changeProblem(event.final ? 'failed' : 'retrying');
        if (event.final) settle(undefined);
        return;
      case 'unsupported':
      case 'unavailable':
        changeProblem(event.kind === 'unsupported' ? 'unsupported' : 'failed');
        settle(undefined);
        return;
    }
  };

  const reset = useCallback(() => {
    if (!siteKey) return;
    tokenRef.current = undefined;
    setToken(undefined);
    setInteractive(false);
    // A retrying check starts its new round clean; a failed one stays failed until "Try again".
    if (problemRef.current === 'retrying') {
      problemRef.current = null;
      setProblem(null);
    }
    setRound((count) => count + 1);
    setRun((count) => count + 1);
  }, [siteKey]);

  const retry = useCallback(() => {
    if (!siteKey) return;
    tokenRef.current = undefined;
    setToken(undefined);
    problemRef.current = null;
    setProblem(null);
    setInteractive(false);
    setAttempt((count) => count + 1);
    setRun((count) => count + 1);
  }, [siteKey]);

  const ready = useCallback((): Promise<BotCheckAnswer> => {
    const current = tokenRef.current;
    if (current) return Promise.resolve({ botCheck: current });
    if (!siteKey) return Promise.resolve({});
    if (problemRef.current === 'failed' || problemRef.current === 'unsupported') return Promise.resolve(null);
    return new Promise<BotCheckAnswer>((resolve) => {
      const done = (value: string | undefined) => {
        window.clearTimeout(timer);
        waiters.current.delete(done);
        if (waiters.current.size === 0) setWaiting(false);
        resolve(value ? { botCheck: value } : null);
      };
      const timer = window.setTimeout(() => done(undefined), BOT_CHECK_WAIT_MS);
      waiters.current.add(done);
      setWaiting(true);
    });
  }, [siteKey]);

  const slow = slowRun === run && !token;
  const status: BotCheckStatus | undefined = !siteKey
    ? undefined
    : token
      ? 'passed'
      : problem === 'failed' || problem === 'unsupported'
        ? problem
        : interactive
          ? 'interactive'
          : slow
            ? 'slow'
            : problem === 'retrying'
              ? 'retrying'
              : 'checking';
  const widget = siteKey
    ? <TurnstileWidget key={attempt} siteKey={siteKey} action={action} round={round} open={interactive || slow} onEvent={onEvent} />
    : null;
  return { token, status, waiting, ready, reset, retry, widget };
}

const STATUS_LOOK: Record<BotCheckStatus, { Icon: LucideIcon; tone: string; spin?: boolean }> = {
  checking: { Icon: LoaderCircle, tone: 'text-muted-foreground', spin: true },
  retrying: { Icon: LoaderCircle, tone: 'text-muted-foreground', spin: true },
  interactive: { Icon: MousePointerClick, tone: 'text-foreground' },
  passed: { Icon: ShieldCheck, tone: 'text-success' },
  slow: { Icon: CircleAlert, tone: 'text-warning' },
  failed: { Icon: CircleAlert, tone: 'text-destructive' },
  unsupported: { Icon: CircleAlert, tone: 'text-destructive' },
};

/**
 * One line that says where the check stands, as a polite live region, with "Try again" when the check is slow or
 * failed. `waiting`: a submit is waiting for it, so a running check says the form goes on by itself once it passes.
 */
export function BotCheckStatusLine({ status, waiting = false, onRetry }: { status: BotCheckStatus; waiting?: boolean; onRetry?: () => void }) {
  const t = useTranslations('forms.botCheck.status');
  const { Icon, tone, spin } = STATUS_LOOK[status];
  const running = status === 'checking' || status === 'retrying';
  const canRetry = Boolean(onRetry) && (status === 'slow' || status === 'failed');
  return <div data-slot="bot-check-status" data-status={status} className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-foreground/[0.035] px-3 py-1.5 text-sm dark:bg-white/[0.04]">
    <p role="status" aria-live="polite" className={cn('flex min-h-8 min-w-0 flex-1 items-center gap-2 py-1', tone)}>
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', spin && 'animate-spin motion-reduce:animate-none')} />
      <span className={cn('min-w-0', status === 'passed' && 'font-medium')}>{t(running && waiting ? 'waiting' : status)}</span>
    </p>
    {canRetry && <button type="button" onClick={onRetry} className="-mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <RotateCcw aria-hidden="true" className="size-4" />{t('retry')}
    </button>}
  </div>;
}

/**
 * The widget, the line that says where the check stands, and the server's answer when it turned the token down
 * (`fieldErrors.botCheck`). That answer stays until a new token is in: the widget asks for one after every submit.
 */
export function BotCheckField({ check, result }: { check: BotCheckState; result?: ActionResult }) {
  const t = useTranslations('forms.botCheck');
  const id = useId();
  const serverCode = result && !result.ok ? result.fieldErrors?.botCheck?.[0] : undefined;
  const message = serverCode && check.status !== 'passed' ? t(serverCode === 'expired' ? 'expired' : serverCode === 'required' ? 'required' : 'failed') : undefined;
  return <div className="relative space-y-2">
    {check.widget}
    {check.status && <BotCheckStatusLine status={check.status} waiting={check.waiting} onRetry={check.retry} />}
    <p id={id} role="status" aria-live="polite" className={message ? 'text-sm font-medium text-destructive' : 'sr-only'}>{message}</p>
  </div>;
}
