'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Photo, PhotoUploadResult, QueryHandler } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_MEGABYTES = 10;

/**
 * Photos for a post or a reply (plan 10.1): a button that opens the camera roll, then thumbnails with a remove button
 * each. Every photo is re-encoded on the server with its location data and all other metadata dropped; the hint says
 * what not to show (house numbers, license plates, other people's faces).
 */
export function CommunityPhotoPicker({ photos, onChange, onUpload, max, disabled = false, id, variant = 'full' }: {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  onUpload: QueryHandler<FormData, PhotoUploadResult>;
  max: number;
  disabled?: boolean;
  id: string;
  /** `full`: the post form's (a labeled button and the hint); `icon`: a reply's (a small button). */
  variant?: 'full' | 'icon';
}) {
  const t = useTranslations('community.photos');
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<PhotoUploadResult, { ok: false }>['code']>();

  async function upload(files: File[]) {
    if (busy || files.length === 0) return;
    setBusy(true);
    setFailure(undefined);
    let current = photos;
    for (const file of files) {
      if (current.length >= max) { setFailure('too_many'); break; }
      if (file.size > MAX_MEGABYTES * 1024 * 1024) { setFailure('too_large'); continue; }
      const body = new FormData();
      body.append('file', file);
      let result: PhotoUploadResult;
      try { result = await onUpload(body); } catch { result = { ok: false, code: 'unknown' }; }
      if (result.ok) {
        current = [...current, result.photo];
        onChange(current);
      } else setFailure(result.code);
    }
    setBusy(false);
  }

  const full = photos.length >= max;
  return <div className="space-y-2" aria-busy={busy}>
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        disabled={disabled || busy || full}
        className="peer sr-only"
        aria-describedby={variant === 'full' ? `${id}-hint` : undefined}
        onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void upload(files); }}
      />
      <label
        htmlFor={id}
        aria-disabled={disabled || busy || full || undefined}
        className={cn(
          'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card text-[13px] font-semibold text-foreground/85 transition-colors hover:border-foreground/30 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          variant === 'full' ? 'px-3.5' : 'size-10 justify-center px-0',
        )}
        title={variant === 'icon' ? t('add') : undefined}
      >
        {busy ? <Spinner aria-hidden="true" /> : <ImagePlus aria-hidden="true" className="size-4 text-primary" />}
        <span className={variant === 'icon' ? 'sr-only' : undefined}>{busy ? t('uploading') : max > 1 ? t('addUpTo', { count: max - photos.length }) : t('add')}</span>
      </label>
      {variant === 'full' && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('hint')}</p>}
    </div>
    {photos.length > 0 && <ul className="flex flex-wrap gap-2">{photos.map((photo, index) => <li key={photo.id} className="relative size-20 overflow-hidden rounded-xl border border-foreground/[0.08] bg-muted dark:border-white/[0.08]">
      <Image unoptimized src={photo.src} alt={photo.alt || t('alt', { number: index + 1, count: photos.length, label: '' })} width={photo.width} height={photo.height} className="size-full object-cover" />
      <button type="button" disabled={disabled || busy} onClick={() => onChange(photos.filter((item) => item.id !== photo.id))} aria-label={t('remove', { number: index + 1 })} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-3.5" /></button>
    </li>)}</ul>}
    {failure && <p role="alert" className="text-sm text-destructive">{t(`errors.${failure}`, { count: max, megabytes: MAX_MEGABYTES })}</p>}
  </div>;
}
