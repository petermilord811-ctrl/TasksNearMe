import { MessagesSquare, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { NeighborsAnswersView } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * "Answers on Neighbors" (2026-11-24): a helper's answers that neighbors marked Helpful, on their profile and its peek.
 * What was asked (never who asked), their answer shortened, where. Credit only: nothing here ranks or rewards them.
 */
export function NeighborsAnswers({ answers, headingId, heading: Heading = 'h2', compact = false }: {
  answers: NeighborsAnswersView;
  headingId: string;
  heading?: 'h2' | 'h3';
  /** The peek: a smaller heading and tighter cards. */
  compact?: boolean;
}) {
  const t = useTranslations('helperProfile.neighborsAnswers');
  return <section aria-labelledby={headingId} className={compact ? 'space-y-2' : 'space-y-4'}>
    <div className="space-y-1">
      <Heading id={headingId} className={compact ? 'font-display text-base font-semibold tracking-[-0.01em]' : 'font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5'}>{t('title')}</Heading>
      <p className="text-sm text-muted-foreground">{t('description', { count: answers.helpedCount })}</p>
    </div>
    <ul className={cn('grid', compact ? 'gap-2' : 'gap-3 md:grid-cols-3')}>
      {answers.answers.map((answer) => <li key={answer.id} className={cn('flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card shadow-card', compact ? 'p-3' : 'p-4')}>
        <p className="flex items-start gap-2 text-sm font-semibold [overflow-wrap:anywhere]"><MessagesSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{answer.questionTitle}</span></p>
        <blockquote className="border-l-2 border-primary/30 pl-3 text-sm leading-6 text-foreground/90 [overflow-wrap:anywhere]">{answer.excerpt}</blockquote>
        <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{t('askedIn', { place: answer.placeName })}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 tabular-nums"><ThumbsUp aria-hidden="true" className="size-3.5 text-primary" />{t('helpful', { count: answer.helpfulCount })}</span>
        </p>
      </li>)}
    </ul>
  </section>;
}
