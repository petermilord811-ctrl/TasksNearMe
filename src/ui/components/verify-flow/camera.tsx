'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { IdCard, ScanFace, TriangleAlert, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';
import { cn } from '@/ui/lib/utils';
import { shrinkPhoto, toJpeg } from './photo';

/** A camera that works, one the browser can't open, or one the person blocked (previews pick one). */
export type CameraState = 'live' | 'unavailable' | 'denied';

const isDenied = (error: unknown) => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');

/**
 * The live camera, Persona-style: the picture fills the frame, a card outline (documents) or an oval (the face) to line
 * up in with the rest dimmed, the instruction over the top, and one round shutter button. `prompt`: the selfie's
 * instruction ("Look to your left"). A camera that can't open shows why and the file picker instead.
 */
export function CaptureCamera({ facing, prompt, simulate, onShot, fallback }: {
  facing: 'user' | 'environment';
  prompt?: string;
  /** Previews: no real camera. */
  simulate?: CameraState;
  onShot: (blob: Blob) => void;
  /** What to offer when the camera can't open (a file picker). */
  fallback: ReactNode;
}) {
  const t = useTranslations('verifyFlow.camera');
  const reduced = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | CameraState>(simulate ?? 'starting');
  const [taking, setTaking] = useState(false);
  const [flash, setFlash] = useState(false);
  const selfie = facing === 'user';

  useEffect(() => {
    if (simulate) return;
    const media = navigator.mediaDevices;
    let stream: MediaStream | undefined;
    let stopped = false;
    if (!media?.getUserMedia) {
      void Promise.resolve().then(() => {
        if (!stopped) setState('unavailable');
      });
      return () => {
        stopped = true;
      };
    }
    media.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }).then(
      (opened) => {
        if (stopped) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        const video = videoRef.current;
        if (!video) return;
        // Ready once the first frame's size is known (a photo of an empty video would be blank).
        video.addEventListener('loadedmetadata', () => {
          if (!stopped) setState('live');
        }, { once: true });
        video.srcObject = opened;
        void video.play().catch(() => undefined);
      },
      (error: unknown) => {
        if (!stopped) setState(isDenied(error) ? 'denied' : 'unavailable');
      },
    );
    return () => {
      stopped = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [facing, simulate]);

  async function take() {
    const video = videoRef.current;
    if (taking || !video || !video.videoWidth) return;
    setTaking(true);
    if (!reduced) {
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }
    // The photo is what the camera sees (the selfie preview is mirrored, the photo isn't).
    const blob = await toJpeg(video, video.videoWidth, video.videoHeight);
    setTaking(false);
    if (blob) onShot(blob);
  }

  if (state === 'unavailable' || state === 'denied') {
    return <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-2xl bg-badge-warning p-3 text-sm text-badge-warning-foreground"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(state === 'denied' ? 'denied' : 'unavailable')}</p>
      {fallback}
    </div>;
  }

  return <div className="space-y-5">
    <div className={cn('relative mx-auto w-full overflow-hidden rounded-[1.5rem] bg-neutral-950', selfie ? 'aspect-[3/4] max-w-[20rem]' : 'aspect-[4/3]')}>
      {simulate
        ? <div aria-hidden="true" className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#4a4038,#1b1612)] text-white/40">{selfie ? <ScanFace className="size-16" /> : <IdCard className="size-16" />}</div>
        : <video ref={videoRef} autoPlay playsInline muted aria-label={t('preview')} className={cn('size-full object-cover', selfie && '-scale-x-100')} />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {selfie
          ? <div className="aspect-[3/4] w-[64%] rounded-[50%] border-[3px] border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]" />
          : <div className="relative aspect-[1.586] w-[86%] rounded-2xl shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]">
            {/* Corner brackets, as a scanner draws them. */}
            {['top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl', 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl', 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl', 'bottom-0 right-0 border-r-[3px] border-b-[3px] rounded-br-2xl'].map((corner) => <span key={corner} className={cn('absolute size-8 border-white', corner)} />)}
          </div>}
      </div>
      {prompt && <p aria-hidden="true" className="absolute inset-x-4 top-4 rounded-full bg-black/65 px-4 py-2 text-center text-[0.9375rem] font-semibold text-white backdrop-blur-sm">{prompt}</p>}
      {state === 'starting' && <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90">{t('starting')}</p>}
      <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0 bg-white transition-opacity duration-150', flash ? 'opacity-70' : 'opacity-0')} />
    </div>
    <div className="flex justify-center">
      <button
        type="button"
        disabled={state !== 'live' || taking}
        aria-busy={taking}
        onClick={() => void take()}
        className="group relative flex size-[4.5rem] items-center justify-center rounded-full border-4 border-foreground/15 bg-card transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-50"
      >
        <span aria-hidden="true" className="size-14 rounded-full bg-primary transition-transform duration-150 group-hover:scale-[1.04]" />
        <span className="sr-only">{t(selfie ? 'takeSelfie' : 'take')}</span>
      </button>
    </div>
  </div>;
}

/** A file picker shown as a button: a photo or a PDF from the device, or (on phones, `capture`) its camera app. */
export function FilePickButton({ label, accept, capture, onFile, variant = 'outline' }: {
  label: string;
  accept: string;
  capture?: 'user' | 'environment';
  onFile: (file: File) => void;
  variant?: 'outline' | 'primary' | 'link';
}) {
  const id = useId();
  const look = {
    outline: 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-foreground/[0.14] bg-card px-5 text-[0.9375rem] font-medium hover:border-foreground/25',
    primary: 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground hover:bg-primary-hover',
    link: 'inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline',
  }[variant];
  return <span className="block">
    <input id={id} type="file" accept={accept} {...(capture ? { capture } : {})} className="peer sr-only" onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) onFile(file);
    }} />
    <label htmlFor={id} className={cn(look, 'cursor-pointer transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background')}>{variant !== 'link' && <Upload aria-hidden="true" className="size-4" />}{label}</label>
  </span>;
}

/** A picked photo file, shrunk for sending. */
export const pickedPhoto = shrinkPhoto;

const COARSE = '(pointer: coarse)';
function subscribeCoarse(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(COARSE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** A touch screen (a phone or tablet): the camera comes first there. False on the server and until hydrated. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches, () => false);
}
