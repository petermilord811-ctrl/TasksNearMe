'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADMIN_QUEUES,
  SAVED_REPLY_BODY_MAX,
  SAVED_REPLY_TITLE_MAX,
  savedReplyInputSchema,
  type ActionResult,
  type AdminQueue,
  type AdminSavedRepliesHandlers,
  type AdminSavedRepliesPageData,
  type SavedReplyInput,
  type SavedReplyView,
} from '@/contracts';
import { formatDate } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

const selectClass = 'h-11 w-full rounded-md border bg-background px-3 text-base sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const PLACEHOLDERS = { firstName: '{first_name}', staffName: '{staff_name}' };

/** Title, queue and text: a new saved reply, or an edit of one. */
function SavedReplyForm({ reply, handlers, onDone, onCancel, initialResult }: {
  reply?: SavedReplyView;
  handlers: AdminSavedRepliesHandlers;
  onDone?: () => void;
  onCancel?: () => void;
  initialResult?: ActionResult;
}) {
  const t = useTranslations('adminSavedReplies');
  const cases = useTranslations('adminCases');
  const id = useId();
  const router = useRouter();
  const form = useForm<SavedReplyInput>({ resolver: zodResolver(savedReplyInputSchema), defaultValues: { title: reply?.title ?? '', body: reply?.body ?? '', queue: reply?.queue ?? '' } });
  const action = useFormAction(form, {
    initialResult,
    onResult: (result) => {
      if (!result.ok) return;
      if (!reply) form.reset({ title: '', body: '', queue: '' });
      router.refresh();
      onDone?.();
    },
  });
  const pending = action.pending || form.formState.isSubmitting;
  const titleCode = form.formState.errors.title?.message;
  const bodyCode = form.formState.errors.body?.message;
  const titleError = titleCode ? t(`errors.title.${titleCode === 'too_long' ? 'too_long' : titleCode === 'required' ? 'required' : 'too_short'}`, { max: SAVED_REPLY_TITLE_MAX }) : undefined;
  const bodyError = bodyCode ? t(`errors.body.${bodyCode === 'too_long' ? 'too_long' : 'required'}`, { max: SAVED_REPLY_BODY_MAX }) : undefined;
  const feedback = action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result;
  return <form noValidate aria-label={reply ? t('form.editLabel', { title: reply.title }) : t('form.newTitle')} aria-busy={pending} className="space-y-4" onSubmit={(event) => {
    if (pending) { event.preventDefault(); return; }
    void form.handleSubmit(async (input) => { await action.run(reply ? (value: SavedReplyInput) => handlers.onUpdate({ ...value, id: reply.id }) : handlers.onCreate, input); })(event);
  }}>
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <Field data-invalid={Boolean(titleError)} className="gap-2">
        <FieldLabel htmlFor={`${id}-title`}>{t('form.title')}</FieldLabel>
        <Input {...form.register('title')} id={`${id}-title`} maxLength={SAVED_REPLY_TITLE_MAX} disabled={pending} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? `${id}-title-error` : undefined} />
        {titleError && <FieldError id={`${id}-title-error`}>{titleError}</FieldError>}
      </Field>
      <Field className="gap-2">
        <FieldLabel htmlFor={`${id}-queue`}>{t('form.queue')}</FieldLabel>
        <select {...form.register('queue')} id={`${id}-queue`} disabled={pending} className={selectClass}>
          <option value="">{t('allQueues')}</option>
          {ADMIN_QUEUES.map((queue) => <option key={queue} value={queue}>{cases(`queues.${queue}`)}</option>)}
        </select>
      </Field>
    </div>
    <Field data-invalid={Boolean(bodyError)} className="gap-2">
      <FieldLabel htmlFor={`${id}-body`}>{t('form.body')}</FieldLabel>
      <FieldDescription id={`${id}-body-hint`}>{t('form.bodyHint', PLACEHOLDERS)}</FieldDescription>
      <Textarea {...form.register('body')} id={`${id}-body`} rows={6} maxLength={SAVED_REPLY_BODY_MAX} disabled={pending} aria-invalid={Boolean(bodyError)} aria-describedby={`${id}-body-hint${bodyError ? ` ${id}-body-error` : ''}`} />
      {bodyError && <FieldError id={`${id}-body-error`}>{bodyError}</FieldError>}
    </Field>
    <FormFeedback result={feedback} {...(feedback?.ok ? { successMessage: t(reply ? 'form.updated' : 'form.saved') } : feedback?.code === 'not_found' ? { errorMessage: t('form.gone') } : {})} />
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onCancel && <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{t('form.cancel')}</Button>}
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending && <Spinner aria-hidden="true" />}{t(reply ? 'form.saveChanges' : 'form.save')}</Button>
    </div>
  </form>;
}

function SavedReplyCard({ reply, canManage, handlers }: { reply: SavedReplyView; canManage: boolean; handlers: AdminSavedRepliesHandlers }) {
  const t = useTranslations('adminSavedReplies');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<ActionResult>();
  async function archive() {
    setArchiving(true);
    try {
      const result = await handlers.onArchive({ id: reply.id });
      setArchiveResult(result);
      if (result.ok) router.refresh();
    } finally {
      setArchiving(false);
    }
  }
  return <li className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    {editing ? <SavedReplyForm reply={reply} handlers={handlers} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /> : <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words">{reply.title}</h3>
        {canManage && <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} aria-label={t('editLabel', { title: reply.title })}>{t('edit')}</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline" disabled={archiving} aria-label={t('archiveLabel', { title: reply.title })}>{archiving && <Spinner aria-hidden="true" />}{t('archive')}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>{t('archiveTitle', { title: reply.title })}</AlertDialogTitle><AlertDialogDescription>{t('archiveBody')}</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>{t('form.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void archive()}>{t('archiveConfirm')}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>}
      </div>
      <p className="text-sm leading-6 whitespace-pre-line break-words">{reply.body}</p>
      <p className="text-xs text-muted-foreground">{t('updated', { name: reply.updatedBy.displayName, date: formatDate(reply.updatedAt) })}</p>
      {archiveResult && !archiveResult.ok && <FormFeedback result={archiveResult} />}
    </>}
  </li>;
}

/**
 * `/admin/saved-replies`: saved replies by queue (every queue first). Leads write, edit and archive them;
 * everyone else reads them here and starts replies from them on a case.
 */
export function AdminSavedRepliesScreen({ data, handlers }: { data: AdminSavedRepliesPageData; handlers: AdminSavedRepliesHandlers }) {
  const t = useTranslations('adminSavedReplies');
  const cases = useTranslations('adminCases');
  const groups: { key: AdminQueue | 'all'; replies: SavedReplyView[] }[] = [
    { key: 'all' as const, replies: data.replies.filter((reply) => !reply.queue) },
    ...ADMIN_QUEUES.map((queue) => ({ key: queue, replies: data.replies.filter((reply) => reply.queue === queue) })),
  ].filter((group) => group.replies.length > 0);
  return <div className="space-y-8">
    <header className="space-y-2">
      <h1 className="font-heading text-2xl/8 font-bold md:text-3xl/9.5">{t('title')}</h1>
      <p className="max-w-3xl text-muted-foreground">{t('intro', PLACEHOLDERS)}</p>
      {!data.canManage && <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
    </header>
    {data.canManage && <section aria-labelledby="saved-replies-new" className="space-y-4 rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id="saved-replies-new" className="text-xl font-semibold">{t('form.newTitle')}</h2>
      <SavedReplyForm handlers={handlers} />
    </section>}
    {groups.length === 0 ? <p className="rounded-xl border bg-card p-5 text-muted-foreground">{t(data.canManage ? 'emptyManage' : 'empty')}</p> : groups.map((group) => <section key={group.key} aria-labelledby={`saved-replies-${group.key}`} className="space-y-3">
      <h2 id={`saved-replies-${group.key}`} className="text-xl font-semibold">{group.key === 'all' ? t('allQueues') : cases(`queues.${group.key}`)}</h2>
      <ul className="grid gap-3 lg:grid-cols-2">{group.replies.map((reply) => <SavedReplyCard key={reply.id} reply={reply} canManage={data.canManage} handlers={handlers} />)}</ul>
    </section>)}
  </div>;
}
