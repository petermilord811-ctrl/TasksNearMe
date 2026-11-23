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
  /** In order; the last is the one each round ends on, and the only one shown without motion. */
  frames: readonly AdFrame[];
  /** How long each frame stays, in milliseconds. */
  durations: readonly number[];
  /** Until the ad starts: the brand on its color, the way an ad slot looks while its creative loads. */
  placeholder: AdFrame;
  /** Times through the frames in one round (two of about 15 s, under the usual 30 s cap). */
  loops?: number;
  /** How much longer the last frame stays at the end of a round, in milliseconds, before the ad plays again. */
  rest?: number;
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
  /** Times through the frames so far, across rounds. */
  loop: number;
  /** The frame fading out under the new one, if any. */
  leaving: number | null;
}

/** Keyboard focus only: a click's focus stays on the link after it opens the advertiser's tab. */
function keyboardFocused(element: Element) {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

/**
 * Plays a display ad's frames the way ad players do: it starts once half of it is on screen (and the page has
 * hydrated) and crossfades from frame to frame. A round is `loops` times through; then its last frame stays for `rest`
 * more and the ad plays again, the way an ad slot refreshes, so it never sits still for good (owner, 2026-11-23: "it's
 * stuck and not animating"; it used to stop after one round until the page was loaded again). It holds while it's out
 * of view or the tab is in the background, and keeps its frame while the pointer is on it or its link has the keyboard
 * focus, so it can be read and stopped. With reduced motion it shows the last frame and never moves. Server-rendered
 * frames come in as props; each one mounts when it comes up, so its entrance (ads.css) plays every time. The ad is a
 * picture: the link around it carries its name.
 */
export function AdFrames({ frames, durations, placeholder, loops = 2, rest = 10_000, still, className }: AdFramesProps) {
  const hydrated = useHydrated();
  const reduced = usePrefersReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const remaining = useRef<{ key: string; ms: number } | null>(null);
  const [inView, setInView] = useState(false);
  const [pageShown, setPageShown] = useState(true);
  const [held, setHeld] = useState(false);
  const [started, setStarted] = useState(false);
  const [play, setPlay] = useState<Play>({ frame: 0, loop: 0, leaving: PLACEHOLDER });
  const last = frames.length - 1;
  const motion = hydrated && !reduced && still === undefined;
  const shown = inView && pageShown;
  const running = motion && started && shown && !held;

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

  // The pointer on the ad, or the keyboard focus on its link, keeps the frame where it is.
  useEffect(() => {
    const node = stage.current;
    const target = node?.closest('a') ?? node;
    if (!target) return;
    let pointer = false;
    let focus = false;
    const update = () => setHeld(pointer || focus);
    const enter = () => { pointer = true; update(); };
    const leave = () => { pointer = false; update(); };
    const focusIn = () => { focus = keyboardFocused(target); update(); };
    const focusOut = () => { focus = false; update(); };
    target.addEventListener('pointerenter', enter);
    target.addEventListener('pointerleave', leave);
    target.addEventListener('focusin', focusIn);
    target.addEventListener('focusout', focusOut);
    return () => {
      target.removeEventListener('pointerenter', enter);
      target.removeEventListener('pointerleave', leave);
      target.removeEventListener('focusin', focusIn);
      target.removeEventListener('focusout', focusOut);
    };
  }, []);

  // The first time it's seen, it starts.
  useEffect(() => {
    if (!motion || started || !shown) return;
    const id = window.setTimeout(() => setStarted(true), 0);
    return () => window.clearTimeout(id);
  }, [motion, started, shown]);

  // Each frame's time (the round's last frame stays `rest` longer); a hold keeps what's left of it for later.
  useEffect(() => {
    if (!running) return;
    const key = `${play.loop}-${play.frame}`;
    const roundEnds = play.frame === last && (play.loop + 1) % loops === 0;
    const wait = remaining.current?.key === key ? remaining.current.ms : (durations[play.frame] ?? 4000) + (roundEnds ? rest : 0);
    remaining.current = null;
    const startedAt = performance.now();
    let fired = false;
    const id = window.setTimeout(() => {
      fired = true;
      setPlay((current) => current.frame === last
        ? { frame: 0, loop: current.loop + 1, leaving: current.frame }
        : { frame: current.frame + 1, loop: current.loop, leaving: current.frame });
    }, wait);
    return () => {
      window.clearTimeout(id);
      if (!fired) remaining.current = { key, ms: Math.max(0, wait - (performance.now() - startedAt)) };
    };
  }, [running, play.frame, play.loop, last, loops, rest, durations]);

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
      data-paused={live && !shown ? '' : undefined}
      data-held={live && held ? '' : undefined}
    >
      {content}
    </div>
  );
}
