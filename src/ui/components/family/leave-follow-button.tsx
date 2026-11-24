'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult, FollowingHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** A follower's "Stop following" (2026-11-24): the client and the helper see a line that they left. */
export function LeaveFollowButton({ bookingId, onLeave, initialResult }: { bookingId: string; onLeave: FollowingHandlers['onLeave']; initialResult?: ActionResult }) {
  const t = useTranslations('family.followed');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  async function leave() {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    try {
      const answer = await onLeave({ bookingId });
      if (answer.ok && answer.redirectTo) {
        router.push(answer.redirectTo);
        return;
      }
      setResult(answer);
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }
  return <div className="space-y-2">
    <Button type="button" variant="outline" className="min-h-11" disabled={pending} aria-busy={pending} onClick={() => void leave()}>
      {pending ? <Spinner aria-hidden="true" /> : <LogOut aria-hidden="true" />}{t('leave')}
    </Button>
    <FormFeedback result={result} successMessage={t('left')} />
  </div>;
}
