'use client';

import { useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult, AppShellHandlers, Mode } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';

export interface ModeSwitchProps {
  mode: Mode;
  onModeChange: AppShellHandlers['onModeChange'];
}

/** Selection follows the viewer prop; a successful handler lets the app supply the new mode. */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  const t = useTranslations('shell');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const statusId = useId();
  const pendingRef = useRef(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function changeMode(nextMode: Mode) {
    if (nextMode === mode || pendingRef.current) return;
    pendingRef.current = true;
    setPendingMode(nextMode);
    setMessage(null);
    let result: ActionResult;
    try {
      result = await onModeChange({ mode: nextMode });
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    pendingRef.current = false;
    setPendingMode(null);
    const text = feedback(`${result.ok ? 'success' : 'error'}.${result.code}`);
    setMessage({ text, error: !result.ok });
    if (result.ok) {
      toast.success(text);
      if (result.redirectTo) router.push(result.redirectTo);
    } else {
      toast.error(text);
    }
  }

  return (
    <div className="min-w-0">
      <div role="group" aria-label={t('mode.label')} aria-busy={pendingMode !== null} aria-describedby={statusId} className="flex rounded-xl bg-muted p-1">
        {(['poster', 'helper'] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant="ghost"
            aria-pressed={mode === option}
            aria-busy={pendingMode === option}
            disabled={pendingMode !== null}
            onClick={() => void changeMode(option)}
            className={cn('min-w-0 flex-1 px-3', mode === option && 'bg-card text-foreground shadow-xs hover:bg-card')}
          >
            {pendingMode === option && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
            {t(`mode.${option}`)}
          </Button>
        ))}
      </div>
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className={cn(message?.error ? 'mt-2 max-w-80 text-sm text-destructive' : 'sr-only')}>
        {pendingMode ? t('mode.pending') : message?.text}
      </p>
    </div>
  );
}
