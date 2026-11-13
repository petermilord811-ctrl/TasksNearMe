'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ImagePlus, LoaderCircle, Lock, X } from 'lucide-react';
import type { Photo, PhotoUploadResult, PostTaskHandlers, PostTaskPageData, TaskDraftInput } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { FileChooser } from '@/ui/components/forms/file-chooser';

type UploadError = Extract<PhotoUploadResult, { ok: false }>['code'];
interface PendingPhoto { key: number; src: string; name: string }
export interface PhotosStepProps {
  data: PostTaskPageData;
  handlers: PostTaskHandlers;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function PhotosStep({ data, handlers, photos, onPhotosChange, onBusyChange }: PhotosStepProps) {
  const t = useTranslations('postTask');
  const errors = useTranslations('forms');
  const id = useId();
  const { control, getValues, setValue, formState } = useFormContext<TaskDraftInput>();
  const photoIds = useWatch({ control, name: 'photoIds' }) ?? [];
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [failure, setFailure] = useState<UploadError>();
  const [notice, setNotice] = useState<'uploaded' | 'removed'>();
  const mounted = useRef(true);
  const queue = useRef(new Map<number, PendingPhoto>());
  const counter = useRef(0);
  const uploaded = useRef(photos);
  const busyCallback = useRef(onBusyChange);
  useEffect(() => { uploaded.current = photos; busyCallback.current = onBusyChange; }, [photos, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    const activeQueue = queue.current;
    return () => {
      mounted.current = false;
      activeQueue.forEach((photo) => URL.revokeObjectURL(photo.src));
      activeQueue.clear();
      busyCallback.current?.(false);
    };
  }, []);

  async function uploadFile(file: File, photo: PendingPhoto) {
    const formData = new FormData();
    formData.append('file', file);
    let result: PhotoUploadResult;
    try { result = await handlers.onUploadPhoto(formData); }
    catch { result = { ok: false, code: 'unknown' }; }
    if (!mounted.current || !queue.current.has(photo.key)) return;
    queue.current.delete(photo.key);
    URL.revokeObjectURL(photo.src);
    if (result.ok) {
      const currentIds = getValues('photoIds');
      if (!currentIds.includes(result.photo.id)) {
        setValue('photoIds', [...currentIds, result.photo.id], { shouldDirty: true, shouldValidate: true });
        uploaded.current = [...uploaded.current.filter((item) => item.id !== result.photo.id), result.photo];
        onPhotosChange(uploaded.current);
      }
      setNotice('uploaded');
    } else setFailure(result.code);
    setPending([...queue.current.values()]);
    busyCallback.current?.(queue.current.size > 0);
  }

  function chooseFiles(files: File[]) {
    setFailure(undefined);
    setNotice(undefined);
    for (const file of files) {
      if (getValues('photoIds').length + queue.current.size >= data.rules.maxPhotos) {
        setFailure('too_many');
        break;
      }
      const photo = { key: counter.current++, src: URL.createObjectURL(file), name: file.name };
      queue.current.set(photo.key, photo);
      void uploadFile(file, photo);
    }
    setPending([...queue.current.values()]);
    busyCallback.current?.(queue.current.size > 0);
  }

  function removePhoto(photoId: string) {
    setValue('photoIds', getValues('photoIds').filter((value) => value !== photoId), { shouldDirty: true, shouldValidate: true });
    uploaded.current = uploaded.current.filter((photo) => photo.id !== photoId);
    onPhotosChange(uploaded.current);
    setNotice('removed');
    setFailure(undefined);
  }

  function removePending(key: number) {
    const photo = queue.current.get(key);
    if (photo) URL.revokeObjectURL(photo.src);
    queue.current.delete(key);
    setPending([...queue.current.values()]);
    busyCallback.current?.(queue.current.size > 0);
    setNotice('removed');
  }

  return <div className="space-y-5">
    <p className="flex items-start gap-2 rounded-2xl bg-secondary/70 p-4 text-sm text-foreground dark:bg-secondary/40"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('photos.privacy')}</p>
    <Field className="gap-2" data-invalid={!!formState.errors.photoIds}>
      <FieldLabel id={`${id}-label`} htmlFor={`${id}-files`}>{t('photos.label')}</FieldLabel>
      <FileChooser id={`${id}-files`} labelledBy={`${id}-label`} multiple accept="image/jpeg,image/png,image/webp,image/heic" disabled={photoIds.length + pending.length >= data.rules.maxPhotos} busy={pending.length > 0} invalid={!!formState.errors.photoIds} describedBy={`${id}-hint${formState.errors.photoIds ? ` ${id}-error` : ''}`} onFiles={chooseFiles} />
      <FieldDescription id={`${id}-hint`}>{t('photos.hint', { count: data.rules.maxPhotos, megabytes: data.rules.maxPhotoMegabytes })}</FieldDescription>
      {formState.errors.photoIds && <FieldError id={`${id}-error`}>{errors('fieldErrors.too_long')}</FieldError>}
    </Field>
    <p className="text-sm tabular-nums text-muted-foreground">{t('photos.count', { count: photoIds.length })}</p>
    {!!(photoIds.length + pending.length) && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photoIds.map((photoId, index) => {
        const photo = photos.find((candidate) => candidate.id === photoId);
        return <li key={photoId} className="min-w-0 overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06] bg-card shadow-card">
          {photo ? <Image src={photo.src} alt={photo.alt || t('photos.restored', { number: index + 1 })} width={photo.width} height={photo.height} unoptimized className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted p-3 text-center text-sm"><ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" /><p>{t('photos.restored', { number: index + 1 })}</p></div>}
          {!photo && <p className="p-3 text-xs text-muted-foreground">{t('photos.restoredHint')}</p>}
          <Button type="button" variant="ghost" className="h-auto w-full min-w-0 whitespace-normal" onClick={() => removePhoto(photoId)} aria-label={t('photos.remove', { number: index + 1 })}><X aria-hidden="true" className="size-4" />{t('photos.remove', { number: index + 1 })}</Button>
        </li>;
      })}
      {pending.map((photo, index) => <li key={photo.key} className="min-w-0 overflow-hidden rounded-2xl border border-foreground/[0.07] dark:border-white/[0.06] bg-card shadow-card" aria-busy="true">
        <Image src={photo.src} alt={t('photos.preview', { name: photo.name })} width={400} height={300} unoptimized className="aspect-[4/3] w-full object-cover opacity-60" />
        <p className="flex items-center justify-center gap-2 px-2 pt-3 text-sm"><LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />{t('photos.uploading')}</p>
        <Button type="button" variant="ghost" className="h-auto w-full min-w-0 whitespace-normal" onClick={() => removePending(photo.key)} aria-label={t('photos.remove', { number: photoIds.length + index + 1 })}><X aria-hidden="true" className="size-4" />{t('photos.remove', { number: photoIds.length + index + 1 })}</Button>
      </li>)}
    </ul>}
    {failure && <p role="alert" className="text-sm text-destructive">{t(`photos.errors.${failure}`, { count: data.rules.maxPhotos, megabytes: data.rules.maxPhotoMegabytes })}</p>}
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending.length ? t('photos.uploading') : notice ? t(`photos.${notice}`) : ''}</p>
  </div>;
}
