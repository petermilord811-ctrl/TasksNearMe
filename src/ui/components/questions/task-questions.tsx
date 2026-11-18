'use client';

import { useId, useState, useTransition } from 'react';
import { CircleHelp, Pin, PinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionHandler, ActionResult } from '@/contracts/actions';
import type { ISODateTime } from '@/contracts/common';
import { TASK_ANSWER_MAX, TASK_QUESTION_MAX, type TaskQuestionHandlers, type TaskQuestionsData, type TaskQuestionView } from '@/contracts/questions';
import { routes } from '@/contracts/routes';
import { CommunityItemActions } from '@/ui/components/community/item-actions';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

function useSubmit() {
  const feedback = useTranslations('feedback');
  const fields = useTranslations('forms.fieldErrors');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const run = (call: () => Promise<ActionResult>, success: string, done?: () => void) => startTransition(async () => {
    let result: ActionResult;
    try {
      result = await call();
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    if (result.ok) {
      setError(undefined);
      toast.success(success);
      done?.();
    } else {
      const field = Object.values(result.fieldErrors ?? {})[0]?.[0];
      setError(field ? fields(fields.has(field) ? field : 'invalid') : feedback.has(`error.${result.code}`) ? feedback(`error.${result.code}`) : feedback('error.unknown'));
    }
  });
  return { pending, error, run };
}

function TextForm({ label, placeholder, hint, max, submit, submitting, success, initial = '', onSubmit }: {
  label: string; placeholder: string; hint?: string; max: number; submit: string; submitting: string; success: string; initial?: string;
  onSubmit: (body: string) => Promise<ActionResult>;
}) {
  const id = useId();
  const [body, setBody] = useState(initial);
  const { pending, error, run } = useSubmit();
  return <form noValidate className="space-y-2" onSubmit={(event) => {
    event.preventDefault();
    if (!pending && body.trim().length >= 2) run(() => onSubmit(body), success, () => setBody(''));
  }}>
    <label htmlFor={`${id}-body`} className="text-sm font-semibold">{label}</label>
    <Textarea id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} maxLength={max} rows={2} aria-invalid={Boolean(error)} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} className="min-h-16" />
    {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    <Button type="submit" size="sm" disabled={pending || body.trim().length < 2} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{pending ? submitting : submit}</Button>
  </form>;
}

function QuestionItem({ question, data, handlers, now }: { question: TaskQuestionView; data: TaskQuestionsData; handlers: TaskQuestionHandlers; now: ISODateTime }) {
  const t = useTranslations('questions');
  const community = useTranslations('community');
  const { formatRelative, formatDateTime } = useFormat();
  const [editing, setEditing] = useState(false);
  const { pending, run } = useSubmit();
  const poster = data.viewer.isPoster;
  const onDelete: ActionHandler<{ target: 'post' | 'reply'; id: string }> = () => handlers.onDelete({ questionId: question.id });
  const onModerate = handlers.onModerate;
  return <li className={cn('space-y-2.5 rounded-2xl border p-3 sm:p-4', question.pinned ? 'border-primary/30 bg-brand-soft/40' : 'border-foreground/[0.07] dark:border-white/[0.06]', question.moderation && 'border-dashed border-destructive/50')}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <InitialsAvatar initials={question.asker.initials} size="sm" />
        <p className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{question.asker.displayName}{question.asker.isYou && <span className="font-normal text-muted-foreground"> ({community('you')})</span>}</span>
          <time dateTime={question.createdAt} title={formatDateTime(question.createdAt)} className="text-xs text-muted-foreground">{formatRelative(question.createdAt, now)}</time>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {question.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"><Pin aria-hidden="true" className="size-3" />{t('pinned')}</span>}
        <CommunityItemActions
          target="reply"
          id={question.id}
          label={question.asker.displayName}
          own={question.asker.isYou && !question.answer}
          onDelete={onDelete}
          {...(!question.asker.isYou ? { reportHref: routes.app.report('question', question.id) } : {})}
          {...(data.viewer.isStaff && onModerate ? { onModerate: (input) => onModerate({ questionId: question.id, action: input.action, reason: input.reason }), hidden: Boolean(question.moderation) } : {})}
        />
      </div>
    </div>
    {question.moderation && <p className="text-xs font-semibold text-destructive">{community(`moderation.${question.moderation.status}`)}{question.moderation.reason && <> · {community('moderation.reason', { reason: question.moderation.reason })}</>}</p>}
    <p className="whitespace-pre-line text-[15px]/6 [overflow-wrap:anywhere]">{question.body}</p>
    {question.answer && !editing && <div className="space-y-1 rounded-xl bg-foreground/[0.03] p-3 dark:bg-white/[0.04]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('answer.from')}</p>
      <p className="whitespace-pre-line text-[15px]/6 [overflow-wrap:anywhere]">{question.answer.body}</p>
    </div>}
    {!question.answer && !poster && <p className="text-xs text-muted-foreground">{t('answer.waiting')}</p>}
    {poster && !question.moderation && (!question.answer || editing
      ? <TextForm label={t('answer.label')} placeholder={t('answer.placeholder')} max={TASK_ANSWER_MAX} submit={t('answer.submit')} submitting={t('answer.submitting')} success={t('answer.sent')} initial={question.answer?.body ?? ''} onSubmit={async (body) => {
          const result = await handlers.onAnswer({ questionId: question.id, body });
          if (result.ok) setEditing(false);
          return result;
        }} />
      : <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>{t('answer.edit')}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => handlers.onPin({ questionId: question.id, pinned: !question.pinned }), t(question.pinned ? 'unpin' : 'pin'))}>
            {question.pinned ? <PinOff aria-hidden="true" className="size-4" /> : <Pin aria-hidden="true" className="size-4" />}{t(question.pinned ? 'unpin' : 'pin')}
          </Button>
        </div>)}
  </li>;
}

/**
 * Questions on a task (completion plan 7.9): the pinned answers first, then the newest; a helper's ask box when
 * they can ask, or why not; the poster answers each one and pins what every helper should read.
 */
/** `wide`: as wide as the page's other cards (the poster's task page, audit L28), not the reading width. */
export function TaskQuestions({ data, handlers, now, wide = false }: { data: TaskQuestionsData; handlers: TaskQuestionHandlers; now: ISODateTime; wide?: boolean }) {
  const t = useTranslations('questions');
  return <section aria-labelledby={`questions-${data.taskId}`} className={cn('mx-auto w-full space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]', wide ? 'max-w-content' : 'max-w-reading')}>
    <header className="space-y-1">
      <h2 id={`questions-${data.taskId}`} className="flex items-center gap-2 text-lg font-semibold"><CircleHelp aria-hidden="true" className="size-5 text-primary" />{t('title')} <span className="text-sm font-normal text-muted-foreground tabular-nums">{t('count', { count: data.questions.length })}</span></h2>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
    </header>
    {data.questions.length === 0
      ? <p className="text-sm text-muted-foreground">{t(data.viewer.isPoster ? 'posterEmpty' : 'empty')}</p>
      : <ol className="space-y-3">{data.questions.map((question) => <QuestionItem key={question.id} question={question} data={data} handlers={handlers} now={now} />)}</ol>}
    {data.viewer.canAsk
      ? <TextForm label={t('ask.label')} placeholder={t('ask.placeholder')} hint={t('ask.hint')} max={TASK_QUESTION_MAX} submit={t('ask.submit')} submitting={t('ask.submitting')} success={t('ask.sent')} onSubmit={(body) => handlers.onAsk({ body })} />
      : data.viewer.askBlocked && !data.viewer.isPoster && <p className="text-sm text-muted-foreground">{t(`blocked.${data.viewer.askBlocked}`)}</p>}
  </section>;
}
