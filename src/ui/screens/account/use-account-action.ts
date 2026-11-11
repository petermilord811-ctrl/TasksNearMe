'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionHandler, ActionResult } from '@/contracts';

/** Result and navigation handling for account controls that are not forms. */
export function useAccountAction({ refresh = false }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function run<T>(handler: ActionHandler<T>, input: T) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await handler(input);
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setResult(next);
    setPending(false);
    locked.current = false;
    if (next.ok) {
      if (next.redirectTo) router.push(next.redirectTo);
      else if (refresh) router.refresh();
    }
    return next;
  }

  return { pending, result, run };
}
