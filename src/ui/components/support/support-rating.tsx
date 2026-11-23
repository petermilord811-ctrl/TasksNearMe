'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { SUPPORT_RATING_COMMENT_MAX, type ActionResult, type RateSupportInput, type SupportRating, type SupportRatingView } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

export interface SupportRatingCardProps {
  rating: SupportRatingView;
  /** Saves the rating: ok `saved`. */
  onRate(input: RateSupportInput): Promise<ActionResult>;
  /** The person from support on the live chat, when there was one ("How was your chat with Riley?"). */
  agentName?: string;
  /** In the Help conversation (tighter), or on the support case page. */
  variant?: 'chat' | 'page';
  /** Seeds for the preview gallery: the comment box open, with a choice made. */
  initialChoice?: SupportRating;
  initialComment?: string;
}

/**
 * Rating the help (2026-11-23, owner: "Live support: rate the chat afterwards"): once the live chat ended or the case is
 * solved, "How did we do?" with Good and Bad, then an optional comment and Send. Afterwards it thanks them and shows
 * their rating, with Change while they still can (7 days). Only support staff see ratings.
 */
export function SupportRatingCard({ rating, onRate, agentName, variant = 'page', initialChoice, initialComment = '' }: SupportRatingCardProps) {
  const t = useTranslations('supportCase.feedback.rating');
  const { formatDateTime, formatDate, zoneName } = useFormat();
  const id = useId();
  // What they rated in this view (the data catches up when the conversation reads again).
  const [saved, setSaved] = useState<RateSupportInput | undefined>();
  const [editing, setEditing] = useState(Boolean(initialChoice));
  const [choice, setChoice] = useState<SupportRating | undefined>(initialChoice);
  const [comment, setComment] = useState(initialComment);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>();
  const locked = useRef(false);
  const given = saved ? { rating: saved.rating, comment: saved.comment } : rating.given;
  const chat = variant === 'chat';

  async function send() {
    if (!choice || locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    const input: RateSupportInput = { rating: choice, ...(comment.trim() ? { comment: comment.trim() } : {}) };
    let next: ActionResult;
    try {
      next = await onRate(input);
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) {
      setSaved(input);
      setEditing(false);
    }
  }

  const error = result && !result.ok
    ? result.fieldErrors?.comment ? t('errors.too_long')
      : result.fieldErrors?.rating ? t('errors.required')
        : result.code === 'expired' ? t('errors.expired')
          : result.code === 'not_allowed' ? t('errors.not_allowed')
            : result.code === 'rate_limited' && result.retryAt ? t('errors.rate_limited', { time: `${formatDateTime(result.retryAt)} ${zoneName}` })
              : t('errors.unknown')
    : undefined;
  const box = cn('space-y-3 rounded-2xl border border-primary/25 bg-brand-soft/40', chat ? 'px-3.5 py-3 text-sm' : 'p-4 sm:p-5');

  // Rated (and not changing it): thanks, what they said, and Change while they can.
  if (given && !editing) {
    return <section aria-labelledby={`${id}-title`} className={box}>
      <h3 id={`${id}-title`} className="sr-only">{t('title')}</h3>
      <p role="status" className="flex items-start gap-2 font-medium">
        {given.rating === 'good' ? <ThumbsUp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /> : <ThumbsDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
        <span>{saved ? (given.rating === 'good' ? t('thanksGood') : t('thanksBad')) : t('yours', { rating: given.rating })}</span>
      </p>
      {given.comment && <blockquote className="border-l-2 border-primary/40 pl-3 whitespace-pre-line text-muted-foreground">{given.comment}</blockquote>}
      {(rating.canRate || saved) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 rounded-full" onClick={() => {
          setChoice(given.rating);
          setComment(given.comment ?? '');
          setResult(undefined);
          setEditing(true);
        }}>{t('change')}</Button>
        {rating.changeUntil && <span className="text-xs text-muted-foreground">{t('changeUntil', { date: formatDate(rating.changeUntil, { withYear: true }) })}</span>}
      </div>}
    </section>;
  }
  if (!rating.canRate && !editing) return null;

  return <section aria-labelledby={`${id}-title`} className={box}>
    <div className="space-y-1">
      <h3 id={`${id}-title`} className={cn('font-semibold', chat ? 'text-sm' : 'text-base')}>{agentName ? t('titleLive', { name: agentName }) : t('title')}</h3>
      <p className={cn('text-muted-foreground', chat ? 'text-xs' : 'text-sm')}>{t('body')}</p>
    </div>
    <div role="group" aria-labelledby={`${id}-title`} className="flex flex-wrap gap-2">
      {(['good', 'bad'] as const).map((value) => <Button key={value} type="button" variant={choice === value ? 'default' : 'outline'} size="sm" aria-pressed={choice === value} disabled={pending} className="min-h-10 rounded-full" onClick={() => {
        setChoice(value);
        setEditing(true);
        setResult(undefined);
      }}>
        {value === 'good' ? <ThumbsUp aria-hidden="true" /> : <ThumbsDown aria-hidden="true" />}{t(value)}
      </Button>)}
    </div>
    {choice && <div className="space-y-2">
      <label htmlFor={`${id}-comment`} className="text-sm font-medium">{t('comment')}</label>
      <Textarea id={`${id}-comment`} rows={chat ? 2 : 3} maxLength={SUPPORT_RATING_COMMENT_MAX} value={comment} disabled={pending} aria-describedby={`${id}-hint`} onChange={(event) => setComment(event.target.value)} className="min-h-11 resize-none field-sizing-content bg-background" />
      <p id={`${id}-hint`} className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums"><span>{t('commentHint')}</span><span>{t('commentCount', { count: comment.length, maximum: SUPPORT_RATING_COMMENT_MAX })}</span></p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} aria-busy={pending} className="min-h-10 rounded-full" onClick={() => void send()}>{pending ? <><Spinner aria-hidden="true" />{t('sending')}</> : t('send')}</Button>
        {given && <Button type="button" variant="ghost" size="sm" disabled={pending} className="min-h-10 rounded-full" onClick={() => {
          setEditing(false);
          setResult(undefined);
        }}>{t('cancel')}</Button>}
      </div>
    </div>}
  </section>;
}
