'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import { aiAssistOutcome, REVIEW_DRAFT_NOTES_MAX, type AiAssistResult, type QueryHandler, type ReviewDraft, type ReviewDraftInput, type ReviewInput } from '@/contracts';
import { AiDraftButton, AiDraftStatus, type AiDraftOutcome } from '@/ui/components/forms/ai-draft';

/** Preview seeds: AI writing now, or what the last request came to. */
export interface ReviewAiDraftPreview {
  pending?: boolean;
  outcome?: AiDraftOutcome;
}

/**
 * "Write it with AI" under the review's words (2026-11-24): from the stars, the tags and whatever is typed in the field,
 * a draft goes into the field for the reviewer to change and send; Undo puts back what they had. Stars come first: without
 * them it asks for a rating and moves focus there.
 */
export function ReviewAiDraft({ form, onDraft, disabled, preview }: {
  form: UseFormReturn<ReviewInput>;
  onDraft: QueryHandler<ReviewDraftInput, AiAssistResult<ReviewDraft>>;
  disabled?: boolean;
  preview?: ReviewAiDraftPreview;
}) {
  const t = useTranslations('review.aiDraft');
  const drafts = useTranslations('forms.aiDraft');
  const id = useId();
  const [pending, setPending] = useState(preview?.pending ?? false);
  const [outcome, setOutcome] = useState<AiDraftOutcome | undefined>(preview?.outcome);
  const [before, setBefore] = useState<string>();
  const [needsRating, setNeedsRating] = useState(false);

  async function draft() {
    if (pending) return;
    const rating = form.getValues('rating');
    if (!rating) {
      setNeedsRating(true);
      form.setFocus('rating');
      return;
    }
    setNeedsRating(false);
    setPending(true);
    setOutcome(undefined);
    const typed = form.getValues('body') ?? '';
    let result: AiAssistResult<ReviewDraft>;
    try {
      result = await onDraft({ rating, tags: form.getValues('tags'), notes: typed.trim().slice(0, REVIEW_DRAFT_NOTES_MAX) });
    } catch {
      result = { ok: false, code: 'unavailable' };
    }
    setPending(false);
    if (!result.ok) {
      const code = aiAssistOutcome(result);
      setOutcome({ kind: 'failed', code: code === 'drafted' ? 'unavailable' : code });
      return;
    }
    setBefore((kept) => kept ?? typed);
    form.setValue('body', result.value.body, { shouldDirty: true, shouldValidate: true });
    setOutcome({ kind: 'drafted' });
  }

  function undo() {
    if (before === undefined) return;
    form.setValue('body', before, { shouldDirty: true, shouldValidate: true });
    setBefore(undefined);
    setOutcome({ kind: 'undone' });
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <AiDraftButton pending={pending} disabled={disabled} onClick={() => void draft()} size="sm" className="rounded-full">{t('button')}</AiDraftButton>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint')}</p>
    </div>
    <div aria-live="polite">{needsRating && <p className="text-sm text-destructive">{t('needsRating')}</p>}</div>
    <AiDraftStatus outcome={outcome} {...(before !== undefined ? { onUndo: undo } : {})} drafted={drafts('draftedSend')} />
  </div>;
}
