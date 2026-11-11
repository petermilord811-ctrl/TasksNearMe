'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { Photo, PhotoUploadResult, QueryHandler } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/ui/primitives/field';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

export interface EvidencePhotoPickerProps {
  id: string;
  label: string;
  hint: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  maxPhotos: number;
  maxPhotoMegabytes: number;
  disabled?: boolean;
  error?: string;
  onBusyChange?: (busy: boolean) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** The posting uploader pattern, independent of a particular form's schema. */
export function EvidencePhotoPicker({ id, label, hint, photos, onChange, onUploadPhoto, maxPhotos, maxPhotoMegabytes, disabled, error, onBusyChange, inputRef }: EvidencePhotoPickerProps) {
  const t = useTranslations('bookingComplete.photos');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<PhotoUploadResult, { ok: false }>['code']>();
  const [notice, setNotice] = useState<'uploaded' | 'removed'>();
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function upload(files: File[]) {
    if (locked.current || disabled || files.length === 0) return;
    locked.current = true;
    setBusy(true); onBusyChange?.(true); setFailure(undefined); setNotice(undefined);
    let current = photos;
    for (const file of files) {
      if (current.length >= maxPhotos) { setFailure('too_many'); break; }
      if (file.size > maxPhotoMegabytes * 1024 * 1024) { setFailure('too_large'); continue; }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) { setFailure('unsupported_type'); continue; }
      const body = new FormData(); body.append('file', file);
      let result: PhotoUploadResult;
      try { result = await onUploadPhoto(body); } catch { result = { ok: false, code: 'unknown' }; }
      if (!mounted.current) return;
      if (result.ok) {
        current = [...current.filter((photo) => photo.id !== result.photo.id), result.photo];
        onChange(current); setNotice('uploaded');
      } else setFailure(result.code);
    }
    locked.current = false; setBusy(false); onBusyChange?.(false);
  }

  return <div className="space-y-3" aria-busy={busy}>
    <Field className="gap-2" data-invalid={!!error || !!failure}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input ref={inputRef} id={id} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple={maxPhotos > 1} disabled={disabled || busy} className="min-h-14 scroll-mb-40 py-3" aria-invalid={!!error || !!failure} aria-describedby={`${id}-hint ${id}-error`} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files); }} />
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      <div id={`${id}-error`} aria-live="polite">{error && <FieldError>{error}</FieldError>}{failure && <FieldError>{t(`errors.${failure}`, { maximum: maxPhotos, megabytes: maxPhotoMegabytes })}</FieldError>}</div>
    </Field>
    {photos.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <li key={photo.id} className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <Image src={photo.src} alt={photo.alt || t('alt', { number: index + 1 })} width={photo.width} height={photo.height} unoptimized className="aspect-[4/3] w-full object-cover" />
      <Button type="button" variant="ghost" disabled={disabled || busy} className="h-auto w-full min-w-0 whitespace-normal" onClick={() => { onChange(photos.filter((item) => item.id !== photo.id)); setFailure(undefined); setNotice('removed'); }}><X aria-hidden="true" className="size-4 shrink-0" />{t('remove', { number: index + 1 })}</Button>
    </li>)}</ul>}
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">{busy && <Spinner />}{busy ? t('uploading') : notice ? t(notice) : ''}</p>
  </div>;
}
