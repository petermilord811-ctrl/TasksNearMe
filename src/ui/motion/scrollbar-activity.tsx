'use client';

import { useEffect, useRef } from 'react';

/** How long a thumb stays after its area stops scrolling. */
const LINGER_MS = 900;
/** How close to the window's right edge the pointer brings the page's thumb back. */
const EDGE_PX = 22;
/** The page's thumb: never shorter than this, and kept this far from the window's top and bottom. */
const MIN_THUMB_PX = 36;
const INSET_PX = 4;

/**
 * The page's scrollbar and the activity the soft scrollbars follow (globals.css, "Scrollbars").
 *
 * The page has no browser scrollbar (so no strip is kept for one): this draws a thin thumb floating over the
 * right edge instead, shown only while the page scrolls, while a mouse is near the right edge or on the thumb,
 * and while it's dragged, then fading out a moment later. A mouse can drag it; on touch screens it's only an
 * indicator. It's decorative (`aria-hidden`): the keyboard, wheel and touch scroll the page as always.
 *
 * Inner scrolling areas keep their own thin scrollbars; any area that scrolls gets `data-scrolling` until it has
 * been still for a moment (their thumbs show then, and on hover). Mount it once per page shell.
 */
export function ScrollbarActivity() {
  const barRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    const thumb = thumbRef.current;
    if (!bar || !thumb) return;
    const timers = new Map<Element, number>();
    let pageScrolling = false;
    let near = false;
    let hovering = false;
    let drag: { pointer: number; startY: number; startScroll: number; ratio: number } | null = null;
    let max = 0;
    let travel = 0;

    const show = () => {
      bar.toggleAttribute('data-active', pageScrolling || near || hovering || drag !== null);
      bar.toggleAttribute('data-dragging', drag !== null);
    };
    const measure = () => {
      const view = window.innerHeight;
      const total = root.scrollHeight;
      max = Math.max(0, total - view);
      const track = Math.max(0, view - INSET_PX * 2);
      const size = Math.min(track, Math.max(MIN_THUMB_PX, (view / Math.max(1, total)) * track));
      travel = Math.max(0, track - size);
      bar.hidden = max <= 1;
      thumb.style.height = `${size}px`;
    };
    const place = () => {
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      thumb.style.transform = `translate3d(0, ${(INSET_PX + progress * travel).toFixed(2)}px, 0)`;
    };
    // Measuring reads the page's height (a layout), so it runs only when sizes change; a scroll only moves the thumb.
    let frame = 0;
    let remeasure = true;
    const refresh = () => {
      frame = 0;
      if (remeasure) measure();
      remeasure = false;
      place();
    };
    const schedule = () => {
      remeasure = true;
      if (!frame) frame = requestAnimationFrame(refresh);
    };
    const scheduleMove = () => {
      if (!frame) frame = requestAnimationFrame(refresh);
    };

    const onScroll = (event: Event) => {
      const area = event.target === document ? root : event.target;
      if (!(area instanceof Element)) return;
      if (!area.hasAttribute('data-scrolling')) area.setAttribute('data-scrolling', '');
      window.clearTimeout(timers.get(area));
      timers.set(
        area,
        window.setTimeout(() => {
          area.removeAttribute('data-scrolling');
          timers.delete(area);
          if (area === root) {
            pageScrolling = false;
            show();
          }
        }, LINGER_MS),
      );
      if (area !== root) return;
      if (!pageScrolling) {
        pageScrolling = true;
        show();
      }
      scheduleMove();
    };

    let edgeFrame = 0;
    let pointerX = -1;
    const checkEdge = () => {
      edgeFrame = 0;
      const next = max > 1 && pointerX >= window.innerWidth - EDGE_PX;
      if (next === near) return;
      near = next;
      root.toggleAttribute('data-scrollbar-near', near);
      show();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointerX = event.clientX;
      if (!edgeFrame) edgeFrame = requestAnimationFrame(checkEdge);
    };
    const onPointerLeave = () => {
      pointerX = -1;
      checkEdge();
    };

    // The thumb: hover widens it, and a mouse can drag the page with it.
    const onEnter = () => {
      hovering = true;
      show();
    };
    const onLeave = () => {
      hovering = false;
      show();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== 'mouse') return;
      event.preventDefault();
      thumb.setPointerCapture(event.pointerId);
      drag = { pointer: event.pointerId, startY: event.clientY, startScroll: window.scrollY, ratio: travel > 0 ? max / travel : 0 };
      show();
    };
    const onDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      window.scrollTo({ top: drag.startScroll + (event.clientY - drag.startY) * drag.ratio, behavior: 'instant' });
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
      drag = null;
      show();
    };

    refresh();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    thumb.addEventListener('pointerenter', onEnter);
    thumb.addEventListener('pointerleave', onLeave);
    thumb.addEventListener('pointerdown', onDown);
    thumb.addEventListener('pointermove', onDrag);
    thumb.addEventListener('pointerup', onUp);
    thumb.addEventListener('pointercancel', onUp);
    // The page grows and shrinks as content loads, reveals and closes: the thumb follows.
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(document.body);

    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      thumb.removeEventListener('pointerenter', onEnter);
      thumb.removeEventListener('pointerleave', onLeave);
      thumb.removeEventListener('pointerdown', onDown);
      thumb.removeEventListener('pointermove', onDrag);
      thumb.removeEventListener('pointerup', onUp);
      thumb.removeEventListener('pointercancel', onUp);
      sized?.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(edgeFrame);
      for (const [area, timer] of timers) {
        window.clearTimeout(timer);
        area.removeAttribute('data-scrolling');
      }
      root.removeAttribute('data-scrollbar-near');
    };
  }, []);

  return (
    <div ref={barRef} className="page-scrollbar" aria-hidden="true" hidden>
      <div ref={thumbRef} className="page-scrollbar-thumb" />
    </div>
  );
}
