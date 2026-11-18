'use client';

import { useState, useTransition } from 'react';
import { Bookmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionHandler, ActionResult } from '@/contracts';
import { cn } from '@/ui/lib/utils';

type Target = { kind: 'post'; onSave: ActionHandler<{ postId: string; saved: boolean }> } | { kind: 'task'; onSave: ActionHandler<{ taskId: string; saved: boolean }> };

/**
 * Save for later (completion plan 9.10, Reddit-style): a post into the viewer's Saved, or a task into a helper's
 * saved tasks (find work's). It answers at once and settles when the server agrees (back as it was, with a note,
 * if it doesn't). A fresh server render wins over the local copy. `compact`: the bookmark alone (its name stays
 * for screen readers), always or only on phones.
 */
export function SaveButton({ id, title, saved, target, compact = false }: { id: string; title: string; saved: boolean; target: Target; compact?: boolean | 'phone' }) {
  const t = useTranslations('community.save');
  const [state, setState] = useState(saved);
  const [seen, setSeen] = useState(saved);
  const [pending, startTransition] = useTransition();
  if (seen !== saved) {
    setSeen(saved);
    setState(saved);
  }

  const toggle = () => {
    const next = !state;
    setState(next);
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = target.kind === 'post' ? await target.onSave({ postId: id, saved: next }) : await target.onSave({ taskId: id, saved: next });
      } catch {
        result = { ok: false, code: 'unknown' };
      }
      if (!result.ok) {
        setState(!next);
        toast.error(t('failed'));
      }
    });
  };

  return <button
    type="button"
    aria-pressed={state}
    aria-label={state ? t('unsaveLabel', { title }) : t('saveLabel', { title })}
    aria-busy={pending || undefined}
    onClick={toggle}
    className={cn(
      'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring',
      compact === true && 'min-w-9 justify-center px-2',
      compact === 'phone' && 'max-sm:min-w-9 max-sm:justify-center max-sm:px-2',
      state ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    <Bookmark aria-hidden="true" className={cn('size-4 transition-transform duration-150', state && 'fill-current motion-safe:scale-110')} />
    {compact !== true && <span aria-hidden="true" className={compact === 'phone' ? 'max-sm:hidden' : undefined}>{state ? t('saved') : t('save')}</span>}
  </button>;
}
