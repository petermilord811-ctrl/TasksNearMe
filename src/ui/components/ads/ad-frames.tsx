'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHydrated } from '@/ui/lib/hydration';
import { cn } from '@/ui/lib/utils';
import { usePrefersReducedMotion } from '@/ui/motion/use-reduced-motion';

/** One frame of a creative: its own background and layout (`className`, from ads.css) and what's in it. */
export interface AdFrame {
  className?: string;
  children: ReactNode;
}

export interface AdFramesProps {
  /** In order; the last is the one the ad rests on, and the only one shown without motion. */
  frames: readonly AdFrame[];
  /** How long each frame stays, in milliseconds. */
  durations: readonly number[];
  /** Until the ad starts: the brand on its color, the way an ad slot looks while its creative loads. */
  placeholder: AdFrame;
  /** Times through the frames before resting on the last one (two of about 15 s: under the usual 30 s cap). */
  loops?: number;
  /** Previews: this frame, drawn still. */
  still?: number;
  className?: string;
}

/** The crossfade between two frames, in ms (ads.css: `.ad-frame[data-state]`). */
const FADE_MS = 520;
/** `leaving` while the placeholder fades out. */
const PLACEHOLDER = -1;

interface Play {
  frame: number;
  loop: number;
  /** The frame fading out under the new one, if any. */
  leaving: number | null;
  done: boolean;
}

/**
 * Plays a display ad's frames the way ad players do: it starts once half of it is on screen (and the page has
 * hydrated), crossfades from frame to frame, holds while it's out of view or the tab is in the background, and after
 * `loops` rounds it stays on its last frame, whose loops (a button's shine, a live dot) finish too. With reduced
 * motion it shows the last frame and never moves. Server-rendered frames come in as props; each one mounts when it
 * comes up, so its entrance (ads.css) plays every time. The ad is a picture: the link around it carries its name.
 */
export function AdFrames({ frames, durations, placeholder, loops = 2, still, className }: AdFramesProps) {
  const hydrated = useHydrated();
  const reduced = usePrefersReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const remaining = useRef<{ key: string; ms: number } | null>(null);
  const [inView, setInView] = useState(false);
  const [pageShown, setPageShown] = useState(true);
  const [started, setStarted] = useState(false);
  const [play, setPlay] = useState<Play>({ frame: 0, loop: 0, leaving: PLACEHOLDER, done: false });
  const last = frames.length - 1;
  const motion = hydrated && !reduced && still === undefined;
  const running = motion && started && !play.done && inView && pageShown;

  // Seen means half of it on screen (the usual viewability bar).
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry && entry.intersectionRatio >= 0.5)), { threshold: [0, 0.5, 1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageShown(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // The first time it's seen, it starts.
  useEffect(() => {
    if (!motion || started || !inView || !pageShown) return;
    const id = window.setTimeout(() => setStarted(true), 0);
    return () => window.clearTimeout(id);
  }, [motion, started, inView, pageShown]);

  // Each frame's time; a pause keeps what's left of it for when the ad is back in view.
  useEffect(() => {
    if (!running) return;
    const key = `${play.loop}-${play.frame}`;
    const wait = remaining.current?.key === key ? remaining.current.ms : (durations[play.frame] ?? 4000);
    remaining.current = null;
    const startedAt = performance.now();
    let fired = false;
    const id = window.setTimeout(() => {
      fired = true;
      setPlay((current) => {
        if (current.frame === last && current.loop >= loops - 1) return { ...current, leaving: null, done: true };
        return current.frame === last
          ? { frame: 0, loop: current.loop + 1, leaving: current.frame, done: false }
          : { frame: current.frame + 1, loop: current.loop, leaving: current.frame, done: false };
      });
    }, wait);
    return () => {
      window.clearTimeout(id);
      if (!fired) remaining.current = { key, ms: Math.max(0, wait - (performance.now() - startedAt)) };
    };
  }, [running, play.frame, play.loop, last, loops, durations]);

  // The frame (or the placeholder) that faded out leaves.
  useEffect(() => {
    if (!started || play.leaving === null) return;
    const id = window.setTimeout(() => setPlay((current) => ({ ...current, leaving: null })), FADE_MS);
    return () => window.clearTimeout(id);
  }, [started, play.leaving, play.frame]);

  const live = motion && started;
  const frameNode = (index: number, key: string, state?: 'in' | 'out') => {
    const frame = frames[index];
    if (!frame) return null;
    return <div key={key} className={cn('ad-frame', frame.className)} data-state={state}>{frame.children}</div>;
  };
  const placeholderNode = (state?: 'out') => <div key="placeholder" className={cn('ad-frame', placeholder.className)} data-state={state}>{placeholder.children}</div>;

  let content: ReactNode;
  if (still !== undefined) content = frameNode(still, 'still');
  else if (!hydrated) content = placeholderNode();
  else if (reduced) content = frameNode(last, 'still');
  else if (!started) content = placeholderNode();
  else {
    // The leaving frame keeps its key (so it isn't mounted again); it belongs to the loop before when the new one is the first.
    const leavingLoop = play.frame === 0 ? play.loop - 1 : play.loop;
    content = <>
      {play.leaving === PLACEHOLDER ? placeholderNode('out') : play.leaving !== null && frameNode(play.leaving, `${leavingLoop}-${play.leaving}`, 'out')}
      {frameNode(play.frame, `${play.loop}-${play.frame}`, 'in')}
    </>;
  }

  return (
    <div
      ref={stage}
      aria-hidden="true"
      className={cn('ad-stage', className)}
      data-live={live ? '' : undefined}
      data-paused={live && !play.done && !(inView && pageShown) ? '' : undefined}
      data-done={live && play.done ? '' : undefined}
    >
      {content}
    </div>
  );
}
