'use client';

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BOT_CHECK_STAND_IN_TOKEN, type ActionResult, type BotCheckAction, type BotCheckConfig } from '@/contracts';

/**
 * The bot check on abuse-prone forms (sign-in code, sign-up, posting). With Turnstile it renders Cloudflare's
 * widget, which only asks for a click when Cloudflare isn't sure (`interaction-only`); its token goes with the
 * form as `botCheck`. With the stand-in (development and tests) the token is there from the start and nothing
 * shows. Tokens work once, so the widget gets a fresh one after each submit (`reset`).
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

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
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
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface BotCheckState {
  /** The token to send as `botCheck` (undefined until the check is done). */
  token: string | undefined;
  /** Ask for a new token (after a submit, whatever the result). */
  reset: () => void;
  /** Turnstile couldn't load (blocked, offline): the form says so instead of waiting forever. */
  failed: boolean;
  /** Where the widget goes. */
  widget: React.ReactNode;
}

/** How long a check may run with no token before its frame shows anyway. */
export const BOT_CHECK_SLOW_MS = 10_000;

function TurnstileWidget({ siteKey, action, resetCount, onToken, onFailed }: { siteKey: string; action: BotCheckAction; resetCount: number; onToken: (token: string | undefined) => void; onFailed: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>(undefined);
  const locale = useLocale();
  // `interaction-only` shows nothing until Cloudflare wants a click, yet its frame kept about 72 px of the form, a blank
  // band above "Create account" (f7's visual pass of the live site, 2026-11-18). So the frame stays out of the layout
  // until Cloudflare says it needs the person (`before-interactive-callback`), and after that for the rest of the round
  // (one round per token, `resetCount`). A check that takes too long without a token shows its frame too, so a challenge
  // that never announced itself can't hide; a token afterwards folds it away again.
  const [rounds, setRounds] = useState<{ interactive?: number; slow?: number; token?: number }>({});
  const open = rounds.interactive === resetCount || (rounds.slow === resetCount && rounds.token !== resetCount);
  const mark = useEffectEvent((what: 'interactive' | 'slow' | 'token') => setRounds((current) => ({ ...current, [what]: resetCount })));
  const reportToken = useEffectEvent((token: string | undefined) => {
    onToken(token);
    if (token) mark('token');
  });
  const reportFailed = useEffectEvent(() => onFailed());

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
        callback: (token: string) => reportToken(token),
        'expired-callback': () => reportToken(undefined),
        'error-callback': () => {
          reportToken(undefined);
          reportFailed();
        },
        'before-interactive-callback': () => mark('interactive'),
      });
    }, () => { if (!cancelled) reportFailed(); });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [siteKey, action, locale]);

  useEffect(() => {
    if (resetCount > 0 && widgetId.current) {
      reportToken(undefined);
      window.turnstile?.reset(widgetId.current);
    }
  }, [resetCount]);

  useEffect(() => {
    const timer = window.setTimeout(() => mark('slow'), BOT_CHECK_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [resetCount]);

  // Closed, the frame keeps the form's width (Turnstile's `flexible` size reads it) but takes no height and no room in
  // the flow, so the margins around the field collapse as if it weren't there.
  return <div ref={container} data-slot="bot-check-widget" data-open={open} className={open ? 'min-h-0 empty:hidden' : 'absolute inset-x-0 top-0 h-0 overflow-hidden'} />;
}

/** The bot check for one form. `config` absent: nothing to check (the server decides what that means). */
export function useBotCheck(config: BotCheckConfig | undefined, action: BotCheckAction): BotCheckState {
  const standIn = config?.provider === 'stand_in';
  const [token, setToken] = useState<string | undefined>(standIn ? BOT_CHECK_STAND_IN_TOKEN : undefined);
  const [failed, setFailed] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const reset = useCallback(() => { if (!standIn) setResetCount((count) => count + 1); }, [standIn]);
  const widget = config?.provider === 'turnstile'
    ? <TurnstileWidget siteKey={config.siteKey} action={action} resetCount={resetCount} onToken={(next) => { setToken(next); if (next) setFailed(false); }} onFailed={() => setFailed(true)} />
    : null;
  return { token, reset, failed, widget };
}

/**
 * The widget and what went wrong with it: the check couldn't load, or the server turned the token down
 * (`fieldErrors.botCheck`). Polite live region, so a screen reader hears it after submitting.
 */
export function BotCheckField({ check, result }: { check: BotCheckState; result?: ActionResult }) {
  const t = useTranslations('forms.botCheck');
  const id = useId();
  const serverCode = result && !result.ok ? result.fieldErrors?.botCheck?.[0] : undefined;
  const message = check.failed ? t('unavailable') : serverCode ? t(serverCode === 'expired' ? 'expired' : serverCode === 'required' ? 'required' : 'failed') : undefined;
  return <div className="relative space-y-2">
    {check.widget}
    <p id={id} role="status" aria-live="polite" className={message ? 'text-sm font-medium text-destructive' : 'sr-only'}>{message}</p>
  </div>;
}
