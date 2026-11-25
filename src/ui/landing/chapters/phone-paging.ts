'use client';

import { useEffect, type RefObject } from 'react';
import { devHelpersOn } from '@/shared/dev-helpers';
import { PHONE_PAGE } from './clock';

/** A flick faster than this (px per ms) moves a page whatever its length. */
const FLICK = 0.35;
/** A slow drag past this share of a page moves on; less settles back. */
const HALF = 0.5;
/** How long the page glides to its chapter (ms). */
const GLIDE_MS = 420;
/** A move this long decides whether the gesture is vertical (px). */
const SLOP = 6;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Phones: one flick is one chapter, like Stories (owner, 2026-11-24, the round-two demo: "On phones, one flick is one
 * page"). While the stage is pinned, a one-finger vertical swipe that starts on it doesn't fling the page freely: the
 * page follows the finger, and when it lets go it glides to the next chapter in the swipe's direction (or back to the
 * one it left, after a short slow drag). Past the last chapter, and back up from the page below, scrolling is the
 * browser's own again. Left alone: two-finger gestures (they move the map), sideways swipes (the chips), touches that
 * start in something that scrolls by itself (`[data-chapter-scrolls]`: the explorer's list), a swipe down on the first
 * chapter (the browser's pull to refresh), and every touch while the stage isn't pinned.
 */
export function usePhonePaging(trackRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const track = trackRef.current;
    const stage = track?.querySelector<HTMLElement>('[data-chapter-stage]');
    if (!track || !stage || !enabled) return;
    const pages = [0, PHONE_PAGE, PHONE_PAGE * 2];
    let top = 0;
    const measure = () => {
      top = track.getBoundingClientRect().top + window.scrollY;
    };
    measure();
    let glide = 0;
    const trace = devHelpersOn() ? ((window as unknown as { __tnmPaging?: object[] }).__tnmPaging ??= []) : null;
    let gesture: { startY: number; startX: number; startScroll: number; page: number; decided: boolean; mine: boolean; cancelable: boolean; samples: { y: number; t: number }[] } | null = null;

    const offset = () => window.scrollY - top;
    const nearestPage = (at: number) => pages.reduce((best, page, index) => (Math.abs(page - at) < Math.abs(pages[best]! - at) ? index : best), 0);
    const stopGlide = () => {
      cancelAnimationFrame(glide);
      glide = 0;
    };
    const glideTo = (to: number) => {
      stopGlide();
      const from = window.scrollY;
      const started = performance.now();
      const run = (now: number) => {
        const t = Math.min(1, (now - started) / GLIDE_MS);
        window.scrollTo(0, from + (to - from) * easeOut(t));
        glide = t < 1 ? requestAnimationFrame(run) : 0;
      };
      glide = requestAnimationFrame(run);
    };

    const onStart = (event: TouchEvent) => {
      stopGlide();
      gesture = null;
      if (event.touches.length !== 1) return;
      const at = offset();
      // Only while the stage is pinned (from the first chapter to the last).
      if (at < -1 || at > pages[2]! + 1) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-chapter-scrolls], input, textarea, select, [contenteditable="true"]')) return;
      const touch = event.touches[0]!;
      gesture = { startY: touch.clientY, startX: touch.clientX, startScroll: window.scrollY, page: nearestPage(at), decided: false, mine: false, cancelable: true, samples: [{ y: touch.clientY, t: event.timeStamp }] };
    };
    const onMove = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = event.touches[0]!;
      const dy = touch.clientY - gesture.startY;
      const dx = touch.clientX - gesture.startX;
      if (!gesture.decided) {
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        gesture.decided = true;
        const forward = dy < 0;
        // Sideways, a pull down on the first chapter, or on past the last one: the browser's.
        gesture.mine = Math.abs(dy) >= Math.abs(dx) && (forward ? gesture.page < pages.length - 1 : gesture.page > 0);
        if (!gesture.mine) {
          gesture = null;
          return;
        }
      }
      if (!event.cancelable) gesture.cancelable = false;
      event.preventDefault();
      gesture.samples.push({ y: touch.clientY, t: event.timeStamp });
      if (gesture.samples.length > 6) gesture.samples.shift();
      // The page follows the finger, within the pages either side of the one it left.
      const low = top + pages[Math.max(0, gesture.page - 1)]!;
      const high = top + pages[Math.min(pages.length - 1, gesture.page + 1)]!;
      window.scrollTo(0, Math.min(high, Math.max(low, gesture.startScroll - dy)));
    };
    const onEnd = () => {
      const done = gesture;
      gesture = null;
      if (!done?.mine) return;
      const samples = done.samples;
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
      const moved = window.scrollY - done.startScroll;
      let page = done.page;
      if (Math.abs(velocity) > FLICK) page += velocity < 0 ? 1 : -1;
      else if (Math.abs(moved) > PHONE_PAGE * HALF) page += moved > 0 ? 1 : -1;
      page = Math.max(0, Math.min(pages.length - 1, page));
      // Development and the e2e build: what each gesture decided, for checks.
      if (trace) trace.push({ from: done.page, to: page, startScroll: Math.round(done.startScroll - top), moved: Math.round(moved), velocity: Number(velocity.toFixed(3)), samples: samples.length, cancelable: done.cancelable, at: Math.round(window.scrollY - top) });
      glideTo(top + pages[page]!);
    };

    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    sized?.observe(track);
    sized?.observe(document.body);
    stage.addEventListener('touchstart', onStart, { passive: true });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onEnd, { passive: true });
    stage.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      stopGlide();
      sized?.disconnect();
      stage.removeEventListener('touchstart', onStart);
      stage.removeEventListener('touchmove', onMove);
      stage.removeEventListener('touchend', onEnd);
      stage.removeEventListener('touchcancel', onEnd);
    };
  }, [trackRef, enabled]);
}
