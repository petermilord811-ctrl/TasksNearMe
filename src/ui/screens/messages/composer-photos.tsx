'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ImagePlus, X } from 'lucide-react';
import type { Photo, PhotoUploadResult, QueryHandler } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * Photos in a message (2026-11-23, owner: "attach image bug, it's unable to scroll to bottom to see photo or no animation
 * while attaching photo … unable to send photo by drag-and-drop in that area directly"): a paperclip opens the file
 * picker at once, chosen photos line up as thumbnails above the message while they upload (their own preview, dimmed,
 * with a spinner, then the photo), and photos can be dropped anywhere on the conversation or pasted into the message.
 */

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type PhotoFailure = Extract<PhotoUploadResult, { ok: false }>['code'];

/** A photo on its way: the file's own preview until the upload answers. */
interface Pending {
  key: string;
  preview: string;
  name: string;
}

export interface ComposerPhotos {
  photos: Photo[];
  pending: Pending[];
  busy: boolean;
  failure?: PhotoFailure;
  add(files: File[]): void;
  remove(id: string): void;
  clear(): void;
}

/** The message's photos: checked as the server would, then uploaded one by one, previews shown meanwhile. */
export function useComposerPhotos({ max, megabytes, onUpload, onChange, disabled }: {
  max: number;
  megabytes: number;
  onUpload: QueryHandler<FormData, PhotoUploadResult>;
  /** The form's attachment ids and whether an upload is under way (Send waits for it). */
  onChange(photos: Photo[], busy: boolean): void;
  disabled?: boolean;
}): ComposerPhotos {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [failure, setFailure] = useState<PhotoFailure>();
  const current = useRef<Photo[]>([]);
  const queued = useRef(0);
  const mounted = useRef(true);
  const report = useRef(onChange);
  useEffect(() => { report.current = onChange; });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const add = useCallback((files: File[]) => {
    if (disabled || files.length === 0) return;
    setFailure(undefined);
    const accepted: { file: File; item: Pending }[] = [];
    for (const file of files) {
      if (current.current.length + queued.current + accepted.length >= max) { setFailure('too_many'); break; }
      if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) { setFailure('unsupported_type'); continue; }
      if (file.size > megabytes * 1024 * 1024) { setFailure('too_large'); continue; }
      accepted.push({ file, item: { key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, preview: URL.createObjectURL(file), name: file.name } });
    }
    if (accepted.length === 0) return;
    queued.current += accepted.length;
    setPending((items) => [...items, ...accepted.map((entry) => entry.item)]);
    report.current(current.current, true);
    void (async () => {
      for (const { file, item } of accepted) {
        const body = new FormData();
        body.append('file', file);
        let result: PhotoUploadResult;
        try { result = await onUpload(body); } catch { result = { ok: false, code: 'unknown' }; }
        queued.current -= 1;
        URL.revokeObjectURL(item.preview);
        if (!mounted.current) return;
        setPending((items) => items.filter((entry) => entry.key !== item.key));
        if (result.ok) {
          current.current = [...current.current.filter((photo) => photo.id !== result.photo.id), result.photo];
          setPhotos(current.current);
        } else setFailure(result.code);
        report.current(current.current, queued.current > 0);
      }
    })();
  }, [disabled, max, megabytes, onUpload]);

  const remove = useCallback((id: string) => {
    current.current = current.current.filter((photo) => photo.id !== id);
    setPhotos(current.current);
    setFailure(undefined);
    report.current(current.current, queued.current > 0);
  }, []);

  const clear = useCallback(() => {
    current.current = [];
    setPhotos([]);
    setFailure(undefined);
  }, []);

  return { photos, pending, busy: pending.length > 0, ...(failure ? { failure } : {}), add, remove, clear };
}

/** The photos above the message: each as it uploads, then as it'll be sent, with its own remove button. */
export function ComposerPhotoStrip({ photos: state, max, megabytes, compact = false }: { photos: ComposerPhotos; max: number; megabytes: number; compact?: boolean }) {
  const t = useTranslations('thread.composer.photoStrip');
  const errors = useTranslations('bookingComplete.photos');
  const size = compact ? 'size-14' : 'size-16';
  if (state.photos.length === 0 && state.pending.length === 0 && !state.failure) return null;
  return <div className="space-y-1.5">
    {(state.photos.length > 0 || state.pending.length > 0) && <ul aria-label={t('label')} className="-mx-1 flex gap-2 overflow-x-auto overscroll-contain px-1 py-1 [scrollbar-width:thin]">
      {state.photos.map((photo, index) => <li key={photo.id} className={cn('relative shrink-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300', size)}>
        <Image src={photo.src} alt={photo.alt || t('alt', { number: index + 1 })} width={photo.width} height={photo.height} unoptimized className="size-full rounded-xl object-cover ring-1 ring-foreground/10" />
        <button type="button" onClick={() => state.remove(photo.id)} aria-label={t('remove', { number: index + 1 })} className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background shadow transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none">
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </li>)}
      {state.pending.map((item) => <li key={item.key} className={cn('relative shrink-0 overflow-hidden rounded-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75', size)}>
        {/* The file's own preview while it uploads (a local blob: never sent anywhere else). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview of a file still on the device */}
        <img src={item.preview} alt="" className="size-full scale-105 object-cover opacity-60 blur-[1px]" />
        <span className="absolute inset-0 grid place-items-center bg-background/35 motion-safe:animate-pulse"><Spinner aria-hidden="true" className="size-5 text-primary" /></span>
      </li>)}
    </ul>}
    <p role="status" className="text-xs text-muted-foreground">
      {state.pending.length > 0 ? t('uploading', { count: state.pending.length }) : state.photos.length > 0 ? t('ready', { count: state.photos.length, max }) : ''}
    </p>
    {state.failure && <p role="alert" className="text-xs text-destructive">{errors(`errors.${state.failure}`, { maximum: max, megabytes })}</p>}
  </div>;
}

/**
 * Photos dropped anywhere on the conversation (its `[data-drop-photos]` panel, or the composer itself): a calm overlay
 * says so while files are over it.
 */
export function usePhotoDrop(anchor: RefObject<HTMLElement | null>, onFiles: (files: File[]) => void, enabled: boolean) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const files = useRef(onFiles);
  useEffect(() => { files.current = onFiles; });
  useEffect(() => {
    const element = anchor.current?.closest<HTMLElement>('[data-drop-photos]') ?? anchor.current;
    if (!element || !enabled) return;
    const frame = requestAnimationFrame(() => setTarget(element));
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    };
    const move = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      if (dropped.length) files.current(dropped);
    };
    element.addEventListener('dragenter', enter);
    element.addEventListener('dragover', move);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    // A photo dropped just beside the conversation would open in the tab and leave the app: dropped files elsewhere are
    // ignored while a composer is on screen (another drop area handles its own drop first).
    const stray = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    window.addEventListener('dragover', stray);
    window.addEventListener('drop', stray);
    return () => {
      window.removeEventListener('dragover', stray);
      window.removeEventListener('drop', stray);
      cancelAnimationFrame(frame);
      element.removeEventListener('dragenter', enter);
      element.removeEventListener('dragover', move);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [anchor, enabled]);
  return { target, over };
}

/** The overlay over the conversation while photos are dragged over it. */
export function PhotoDropOverlay({ target, over }: { target: HTMLElement | null; over: boolean }) {
  const t = useTranslations('thread.composer.photoStrip');
  if (!target || !over) return null;
  return createPortal(<div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[inherit] bg-background/80 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0">
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-card/90 px-8 py-6 text-center shadow-lg motion-safe:animate-in motion-safe:zoom-in-95">
      <ImagePlus className="size-8 text-primary motion-safe:animate-bounce" />
      <p className="font-semibold">{t('drop')}</p>
    </div>
  </div>, target);
}
