'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ImagePlus, LoaderCircle, Lock, Trash2 } from 'lucide-react';
import type { ActionResult, CategorySlug, CategoryView, HelperProfileEditorHandlers, WorkSampleUploadResult, WorkSampleView } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { WorkSampleGallery } from '@/ui/components/people/work-sample-gallery';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';

type SampleHandlers = Pick<HelperProfileEditorHandlers, 'onUploadWorkSample' | 'onUpdateWorkSample' | 'onRemoveWorkSample' | 'onReorderWorkSamples'>;
type UploadError = Extract<WorkSampleUploadResult, { ok: false }>['code'];
export interface WorkSamplesEditorProps {
  samples: WorkSampleView[];
  categories: CategoryView[];
  maxWorkSamples: number;
  maxPhotoMegabytes: number;
  handlers: SampleHandlers;
}

const selectClass = 'min-h-11 w-full min-w-0 rounded-[10px] border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';

function SampleFields({ sample, categories, disabled }: { sample?: WorkSampleView; categories: CategoryView[]; disabled: boolean }) {
  const t = useTranslations('helperProfileEditor.samples');
  const id = useId();
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field className="gap-2">
      <FieldLabel htmlFor={`${id}-caption`}>{t('caption')}</FieldLabel>
      <Input id={`${id}-caption`} name="caption" defaultValue={sample?.caption ?? ''} disabled={disabled} aria-describedby={`${id}-caption-hint`} />
      <FieldDescription id={`${id}-caption-hint`}>{t('captionHint')}</FieldDescription>
    </Field>
    <Field className="gap-2">
      <FieldLabel htmlFor={`${id}-category`}>{t('category')}</FieldLabel>
      <select id={`${id}-category`} name="categorySlug" defaultValue={sample?.categorySlug ?? ''} disabled={disabled} className={selectClass} aria-describedby={`${id}-category-hint`}>
        <option value="">{t('noCategory')}</option>
        {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
      </select>
      <FieldDescription id={`${id}-category-hint`}>{t('categoryHint')}</FieldDescription>
    </Field>
  </div>;
}

export function WorkSamplesEditor({ samples, categories, maxWorkSamples, maxPhotoMegabytes, handlers }: WorkSamplesEditorProps) {
  const t = useTranslations('helperProfileEditor.samples');
  const router = useRouter();
  const id = useId();
  const [source, setSource] = useState(samples);
  const [items, setItems] = useState(samples);
  // Older handlers may omit the optional sample. Keep only those photos separate until the
  // authoritative work-sample id arrives; never send a photo id to sample mutations.
  const [uploaded, setUploaded] = useState<WorkSampleView[]>([]);
  const [pending, setPending] = useState<string>();
  const [result, setResult] = useState<ActionResult>();
  const [uploadError, setUploadError] = useState<UploadError>();
  const [uploadedNotice, setUploadedNotice] = useState(false);
  const [confirmId, setConfirmId] = useState<string>();
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  if (source !== samples) {
    setSource(samples);
    setItems(samples);
  }
  // Props may arrive before the upload promise resolves. Reconcile every saved confirmation
  // against the current authoritative samples so either arrival order counts each photo once.
  const awaitingSamples = uploaded.filter((item) => !samples.some((sample) => sample.photo.id === item.photo.id));
  if (awaitingSamples.length !== uploaded.length) setUploaded(awaitingSamples);
  const busy = pending !== undefined;
  const count = items.length + uploaded.length;

  async function mutate(operation: string, action: () => Promise<ActionResult>, onSuccess: () => void) {
    if (locked.current) return;
    locked.current = true;
    setPending(operation);
    setResult(undefined);
    setUploadError(undefined);
    setUploadedNotice(false);
    let next: ActionResult;
    try { next = await action(); }
    catch { next = { ok: false, code: 'unknown' }; }
    setResult(next.ok ? next : { ...next, fieldErrors: undefined });
    if (next.ok) {
      onSuccess();
      if (next.redirectTo) router.push(next.redirectTo);
    }
    locked.current = false;
    setPending(undefined);
  }

  function saveSample(event: FormEvent<HTMLFormElement>, sample: WorkSampleView) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const caption = String(fields.get('caption') ?? '').trim();
    const categorySlug = (String(fields.get('categorySlug') ?? '') || undefined) as CategorySlug | undefined;
    void mutate(`save-${sample.id}`, () => handlers.onUpdateWorkSample({ id: sample.id, caption, categorySlug }), () => {
      setItems((current) => current.map((item) => item.id === sample.id ? { ...item, caption, categorySlug } : item));
    });
  }

  function move(index: number, offset: -1 | 1) {
    const next = [...items];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void mutate(`move-${offset}-${items[index]!.id}`, () => handlers.onReorderWorkSamples({ ids: next.map((sample) => sample.id) }), () => setItems(next));
  }

  function rejectUpload(code: UploadError) {
    setUploadError(code);
    fileInput.current?.focus();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setResult(undefined);
    setUploadError(undefined);
    setUploadedNotice(false);
    if (count >= maxWorkSamples) { rejectUpload('too_many'); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = fileInput.current?.files?.[0];
    if (!(file instanceof File) || !file.size) { rejectUpload('unsupported_type'); return; }
    if (file.size > maxPhotoMegabytes * 1024 * 1024) { rejectUpload('too_large'); return; }
    data.set('file', file);
    const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!accepted.includes(file.type) && !(file.type === '' && /\.(jpe?g|png|webp|heic)$/i.test(file.name))) {
      rejectUpload('unsupported_type');
      return;
    }
    locked.current = true;
    setPending('upload');
    let next: WorkSampleUploadResult;
    try { next = await handlers.onUploadWorkSample(data); }
    catch { next = { ok: false, code: 'unknown' }; }
    if (next.ok) {
      const photo = next.photo;
      if (next.sample) {
        const sample = next.sample;
        // A prop refresh can beat the upload response. Add the authoritative sample once.
        setItems((current) => current.some((item) => item.id === sample.id) ? current : [...current, sample]);
      } else if (!items.some((sample) => sample.photo.id === photo.id)) {
        setUploaded((current) => [...current.filter((sample) => sample.photo.id !== photo.id), {
          id: `uploaded-${photo.id}`, photo,
          caption: String(data.get('caption') ?? '').trim(),
          categorySlug: (String(data.get('categorySlug') ?? '') || undefined) as CategorySlug | undefined,
        }]);
      }
      setUploadedNotice(true);
      form.reset();
      if (!next.sample) router.refresh();
    } else setUploadError(next.code);
    locked.current = false;
    setPending(undefined);
  }

  return <div className="space-y-6" aria-busy={busy}>
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <p className="text-sm tabular-nums">{t('count', { count, max: maxWorkSamples })}</p>
    </div>
    <p className="flex items-start gap-2 rounded-lg bg-secondary p-4 text-sm text-secondary-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('privacy')}</p>
    {items.length > 0 ? <details className="rounded-xl border bg-card p-4">
      <summary className="min-h-11 cursor-pointer font-medium">{t('gallery')}</summary>
      <WorkSampleGallery samples={items} />
    </details> : <div className="rounded-xl border border-dashed p-5 text-center">
      <ImagePlus aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="font-medium">{t('empty')}</p><p className="mt-1 text-sm text-muted-foreground">{t('emptyHint')}</p>
    </div>}
    <ol className="space-y-4">
      {items.map((sample, index) => <li key={sample.id} className="min-w-0 rounded-xl border bg-card p-4 shadow-card sm:p-5">
        <form aria-label={t('sample', { number: index + 1 })} onSubmit={(event) => saveSample(event, sample)} className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">{t('sample', { number: index + 1 })}</h3>
          <SampleFields sample={sample} categories={categories} disabled={busy} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={busy} aria-busy={pending === `save-${sample.id}`}>
              {pending === `save-${sample.id}` && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}{t('save', { number: index + 1 })}
            </Button>
            <Button type="button" variant="outline" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-busy={pending === `move--1-${sample.id}`} aria-label={t('moveUp', { number: index + 1 })}>{pending === `move--1-${sample.id}` ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowUp aria-hidden="true" className="size-4" />}{t('up')}</Button>
            <Button type="button" variant="outline" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)} aria-busy={pending === `move-1-${sample.id}`} aria-label={t('moveDown', { number: index + 1 })}>{pending === `move-1-${sample.id}` ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowDown aria-hidden="true" className="size-4" />}{t('down')}</Button>
            <AlertDialog open={confirmId === sample.id} onOpenChange={(open) => setConfirmId(open ? sample.id : undefined)}>
              <AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={busy} aria-busy={pending === `remove-${sample.id}`} aria-label={t('remove', { number: index + 1 })}>{pending === `remove-${sample.id}` ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Trash2 aria-hidden="true" className="size-4" />}{t('remove', { number: index + 1 })}</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>{t('removeTitle')}</AlertDialogTitle><AlertDialogDescription>{t('removeDescription')}</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void mutate(`remove-${sample.id}`, () => handlers.onRemoveWorkSample({ id: sample.id }), () => setItems((current) => current.filter((item) => item.id !== sample.id)))}>{t('confirmRemove')}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </form>
      </li>)}
    </ol>
    {uploaded.length > 0 && <div className="space-y-3 rounded-xl border border-success/30 p-4"><p className="text-sm">{t('awaitingSync')}</p><WorkSampleGallery samples={uploaded} /></div>}
    <form noValidate onSubmit={(event) => void upload(event)} className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="font-heading text-lg font-semibold">{t('add')}</h3>
      <Field className="gap-2">
        <FieldLabel htmlFor={`${id}-file`}>{t('file')}</FieldLabel>
        <Input ref={fileInput} id={`${id}-file`} name="file" type="file" required accept="image/jpeg,image/png,image/webp,image/heic" disabled={busy || count >= maxWorkSamples} aria-describedby={`${id}-file-hint${uploadError ? ` ${id}-file-error` : ''}`} aria-invalid={!!uploadError} className="min-h-14 py-3" />
        <FieldDescription id={`${id}-file-hint`}>{t('fileHint', { megabytes: maxPhotoMegabytes })}</FieldDescription>
        {uploadError && <p id={`${id}-file-error`} role="alert" className="text-sm text-destructive">{t(`errors.${uploadError}`, { max: maxWorkSamples, megabytes: maxPhotoMegabytes })}</p>}
      </Field>
      <SampleFields categories={categories} disabled={busy || count >= maxWorkSamples} />
      {count >= maxWorkSamples && <p className="text-sm text-muted-foreground">{t('limit', { max: maxWorkSamples })}</p>}
      <Button type="submit" disabled={busy || count >= maxWorkSamples} aria-busy={pending === 'upload'}>{pending === 'upload' ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <ImagePlus aria-hidden="true" className="size-4" />}{t(pending === 'upload' ? 'uploading' : 'upload')}</Button>
    </form>
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">{busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}{busy ? t(pending === 'upload' ? 'uploading' : 'working') : uploadedNotice ? t('uploaded') : ''}</p>
    <FormFeedback result={result} successMessage={t('saved')} />
  </div>;
}
