'use client';

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ImagePlus, ZoomIn, ZoomOut } from 'lucide-react';
import { clampCrop, initialCrop, MAX_ZOOM, MIN_ZOOM, moveCrop, photoBox, sourceSquare, type CropState } from '@/ui/lib/photo-crop';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';

/** The chosen photo, decoded in the browser (an object URL and its natural size). */
export interface CropImage {
  src: string;
  width: number;
  height: number;
}

/** The size of the square drawn into the upload: the server keeps profile photos at 512 px (AVATAR_PX). */
const OUTPUT_PX = 512;

/** Draws the framed square into a JPEG for the upload. Null when the browser can't (no canvas). */
export async function croppedPhoto(image: CropImage, state: CropState): Promise<Blob | null> {
  const element = new Image();
  element.src = image.src;
  await element.decode();
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const square = sourceSquare(image, state);
  context.imageSmoothingQuality = 'high';
  context.drawImage(element, square.x, square.y, square.size, square.size, 0, 0, OUTPUT_PX, OUTPUT_PX);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/**
 * "Adjust your photo" (plan 9.3): the chosen photo in a square frame with the round avatar marked, moved by dragging
 * (or the arrow keys) and zoomed with a slider (or + and −), so people see exactly what others will see before it's
 * saved. No wheel zoom: scrolling over it scrolls the page, as everywhere else.
 */
export function PhotoCropDialog({ image, onCancel, onConfirm, onChooseAnother }: {
  /** Open while there's a photo to adjust. */
  image: CropImage | null;
  onCancel: () => void;
  onConfirm: (state: CropState) => void;
  onChooseAnother: () => void;
}) {
  const t = useTranslations('forms.profilePhoto.crop');
  const id = useId();
  const [state, setState] = useState<CropState>(initialCrop);
  const [shown, setShown] = useState<string | null>(null);
  // A new photo starts centred at zoom 1 (state reset while rendering, not in an effect).
  if (image && shown !== image.src) {
    setShown(image.src);
    setState(initialCrop);
  }
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);

  const side = () => frame.current?.getBoundingClientRect().width || 1;
  const move = (dx: number, dy: number) => image && setState((current) => moveCrop(image, current, dx, dy));
  const zoomTo = (zoom: number) => image && setState((current) => clampCrop(image, { zoom, center: current.center }));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const width = side();
    move((event.clientX - current.x) / width, (event.clientY - current.y) / width);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.025;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      move(...moves[event.key]!);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTo(state.zoom + 0.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomTo(state.zoom - 0.25);
    }
  }

  const box = image ? photoBox(image, state) : null;
  return (
    <Dialog open={image !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {image && box && (
          <div className="grid justify-items-center gap-4">
            <div
              ref={frame}
              role="group"
              tabIndex={0}
              aria-label={t('frame')}
              aria-describedby={`${id}-hint`}
              data-testid="photo-crop-frame"
              className="relative aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-2xl bg-muted outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing sm:max-w-80"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, positioned by the crop */}
              <img src={image.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }} />
              {/* The round avatar people will see; the corners outside it are dimmed. */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-[6%] rounded-full shadow-[0_0_0_999px_rgb(23_18_14/0.5)] ring-2 ring-white/90" />
            </div>
            <p id={`${id}-hint`} className="text-center text-sm text-muted-foreground">{t('hint')}</p>
            <div className="flex w-full max-w-80 items-center gap-3">
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label={t('zoomOut')} disabled={state.zoom <= MIN_ZOOM} onClick={() => zoomTo(state.zoom - 0.25)}>
                <ZoomOut aria-hidden="true" />
              </Button>
              <label htmlFor={`${id}-zoom`} className="sr-only">{t('zoom')}</label>
              <input
                id={`${id}-zoom`}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={state.zoom}
                onChange={(event) => zoomTo(Number(event.target.value))}
                className="h-11 min-w-0 flex-1 cursor-pointer accent-primary"
              />
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label={t('zoomIn')} disabled={state.zoom >= MAX_ZOOM} onClick={() => zoomTo(state.zoom + 0.25)}>
                <ZoomIn aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:flex-wrap sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" className="min-h-11" onClick={onChooseAnother}>
            <ImagePlus aria-hidden="true" />
            {t('another')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>{t('cancel')}</Button>
            <Button type="button" className="min-h-11" onClick={() => onConfirm(state)}>
              <Check aria-hidden="true" />
              {t('save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
