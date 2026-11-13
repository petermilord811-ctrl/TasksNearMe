'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult } from '@/contracts';

/**
 * One series mutation at a time: pending while it runs (a second tap is ignored), the result kept for the inline
 * message, and on success a toast, the redirect if there is one, and a refresh so the page shows the new state.
 */
export function useSeriesMutation() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult>();
  const running = useRef(false);

  async function run(key: string, call: () => Promise<ActionResult>, successMessage?: string): Promise<ActionResult | undefined> {
    if (running.current) return undefined;
    running.current = true;
    setPending(key);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await call();
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    running.current = false;
    setPending(null);
    setResult(next);
    if (next.ok) {
      if (successMessage) toast.success(successMessage);
      if (next.redirectTo) router.push(next.redirectTo);
      else router.refresh();
    }
    return next;
  }

  return { pending, result, setResult, run, refresh: () => router.refresh() };
}
