'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ActionHandler, ActionResult } from '@/contracts';
import { openInChatWindow } from './chat-window-open';
import { useRouteDialog } from './route-dialog';

/** Shares result handling, but leaves validation and flow decisions with the contracts/app. */
export function useFormAction<T extends FieldValues>(form: UseFormReturn<T>, options: {
  initialResult?: ActionResult;
  onResult?: (result: ActionResult) => void;
  navigation?: 'push' | 'replace';
  /** In a route dialog, said as a toast when the result closes it (the form's own success line goes with the dialog). */
  successToast?: string;
} = {}) {
  const router = useRouter();
  const dialog = useRouteDialog();
  const [result, setResult] = useState(options.initialResult);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const { getValues, setError } = form;

  useEffect(() => {
    if (!result || result.ok || !result.fieldErrors || pending) return;
    let first = true;
    for (const field of Object.keys(getValues()) as Path<T>[]) {
      const code = result.fieldErrors[field]?.[0];
      if (!code) continue;
      setError(field, { type: 'server', message: code }, { shouldFocus: first });
      first = false;
    }
  }, [result, pending, getValues, setError]);

  async function run<I>(handler: ActionHandler<I>, input: I): Promise<ActionResult | undefined> {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    form.clearErrors();
    let next: ActionResult;
    try {
      next = await handler(input);
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
    options.onResult?.(next);
    // A full page goes where the result says; a route dialog closes over the page it was opened from instead.
    if (next.ok && next.redirectTo) {
      if (dialog) dialog.finish(next, options.successToast);
      // A conversation opens in the chat window on wide screens instead (2026-11-23); anything else, its page.
      else if (!openInChatWindow(next.redirectTo)) router[options.navigation ?? 'push'](next.redirectTo);
    }
    return next;
  }

  return { result, pending, run };
}
