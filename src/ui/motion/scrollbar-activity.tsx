'use client';

import { useEffect, useRef } from 'react';

/** How long a thumb stays after its area stops scrolling. */
const LINGER_MS = 900;
/** How close to the window's right edge the pointer brings the page's thumb back (and keeps a held track paging). */
const EDGE_PX = 22;
/** The page's thumb: never shorter than this, and kept this far from the window's top and bottom. */
const MIN_THUMB_PX = 36;
const INSET_PX = 4;
/** A click on the track moves the page by this much of the window, as browsers page (7/8, so a few lines stay in view). */
const PAGE_FRACTION = 0.875;
/** Holding the track keeps paging: after this pause, then every `REPEAT_MS`, until the thumb reaches the pointer. */
const HOLD_DELAY_MS = 250;
const REPEAT_MS = 50;
/** How briskly a track click's glide settles (a critically damped spring, radians a second). */
const GLIDE_RATE = 16;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The page's scrollbar and the activity the soft scrollbars follow (globals.css, "Scrollbars").
 *
 * The page has no browser scrollbar (so no strip is kept for one): this draws a thin thumb floating over the
 * right edge instead, shown only while the page scrolls, while a mouse is near the right edge or on the bar,
 * and while it's held, then fading out a moment later. With a mouse it works like a browser's own scrollbar:
 * drag the thumb; click the track to glide a page toward the click (hold to keep going until the thumb gets
 * there); Shift-click the track to jump to that spot. On touch screens it's only an indicator. It's decorative
 * (`aria-hidden`): the keyboard, wheel and touch scroll the page as always.
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
    /** The track held down: which way it pages, and where the pointer is now. */
    let press: { pointer: number; x: number; y: number; direction: 1 | -1; timer: number } | null = null;
    let max = 0;
    let size = 0;
    let travel = 0;

    const show = () => {
      const held = drag !== null || press !== null;
      bar.toggleAttribute('data-active', pageScrolling || near || hovering || held);
      // The strip takes clicks only while a mouse is at the edge (or holding it), never just because the page moved.
      bar.toggleAttribute('data-reachable', near || hovering || held);
      bar.toggleAttribute('data-held', held);
      bar.toggleAttribute('data-dragging', drag !== null);
    };
    const measure = () => {
      const view = window.innerHeight;
      const total = root.scrollHeight;
      max = Math.max(0, total - view);
      const track = Math.max(0, view - INSET_PX * 2);
      size = Math.min(track, Math.max(MIN_THUMB_PX, (view / Math.max(1, total)) * track));
      travel = Math.max(0, track - size);
      bar.hidden = max <= 1;
      thumb.style.height = `${size}px`;
    };
    /** Where the thumb's top sits (from the window's top) when the page is scrolled to `scroll`. */
    const thumbTopAt = (scroll: number) => INSET_PX + (max > 0 ? clamp(scroll / max, 0, 1) : 0) * travel;
    const place = () => {
      thumb.style.transform = `translate3d(0, ${thumbTopAt(window.scrollY).toFixed(2)}px, 0)`;
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

    // A track click glides the page instead of jumping. It's driven here, a frame at a time, so that clicking
    // again (or holding) retargets the glide without restarting it from a standstill.
    let glide: { target: number; position: number; velocity: number; last: number; frame: number } | null = null;
    const stopGlide = () => {
      if (!glide) return;
      cancelAnimationFrame(glide.frame);
      glide = null;
    };
    const glideFrame = (now: number) => {
      const current = glide;
      if (!current) return;
      // Something else moved the page meanwhile (the wheel, a key, a link, the page's own end): it wins.
      if (Math.abs(window.scrollY - current.position) > 2) {
        glide = null;
        return;
      }
      // Frame times only: the first frame counts as one at 60 Hz, and a stalled tab doesn't leap.
      const dt = current.last ? clamp((now - current.last) / 1000, 1 / 240, 1 / 20) : 1 / 60;
      current.last = now;
      const offset = current.position - current.target;
      const decay = Math.exp(-GLIDE_RATE * dt);
      const lead = current.velocity + GLIDE_RATE * offset;
      const nextOffset = (offset + lead * dt) * decay;
      current.velocity = (current.velocity - GLIDE_RATE * lead * dt) * decay;
      const settled = Math.abs(nextOffset) < 0.5 && Math.abs(current.velocity) < 20;
      current.position = settled ? current.target : current.target + nextOffset;
      window.scrollTo({ top: current.position, behavior: 'instant' });
      if (settled) glide = null;
      else current.frame = requestAnimationFrame(glideFrame);
    };
    const glideTo = (target: number) => {
      const top = clamp(target, 0, max);
      if (reducedMotion()) {
        stopGlide();
        window.scrollTo({ top, behavior: 'instant' });
        return;
      }
      if (glide) {
        glide.target = top;
        return;
      }
      glide = { target: top, position: window.scrollY, velocity: 0, last: 0, frame: 0 };
      glide.frame = requestAnimationFrame(glideFrame);
    };

    /** One page toward the held pointer, unless the thumb is already headed under it (or the pointer has left). */
    const pageToward = () => {
      if (!press || press.x < window.innerWidth - EDGE_PX) return;
      const target = glide ? glide.target : window.scrollY;
      const top = thumbTopAt(target);
      const reached = press.direction < 0 ? press.y >= top : press.y < top + size;
      if (reached) return;
      glideTo(target + press.direction * Math.max(1, window.innerHeight * PAGE_FRACTION));
    };
    const keepPaging = () => {
      if (!press) return;
      pageToward();
      press.timer = window.setTimeout(keepPaging, REPEAT_MS);
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

    // The bar: hovering it widens the thumb; a mouse drags the thumb or clicks the track. Which part was hit goes
    // by height alone, so the thumb's whole row counts as the thumb, as in a browser's own scrollbar.
    const onEnter = () => {
      hovering = true;
      show();
    };
    const onLeave = () => {
      hovering = false;
      show();
    };
    const capture = (pointer: number) => {
      if (typeof bar.setPointerCapture === 'function') bar.setPointerCapture(pointer);
    };
    const release = (pointer: number) => {
      if (typeof bar.hasPointerCapture === 'function' && bar.hasPointerCapture(pointer)) bar.releasePointerCapture(pointer);
    };
    const startDrag = (pointer: number, y: number) => {
      drag = { pointer, startY: y, startScroll: window.scrollY, ratio: travel > 0 ? max / travel : 0 };
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== 'mouse' || drag || press) return;
      event.preventDefault();
      measure();
      stopGlide();
      capture(event.pointerId);
      const top = thumbTopAt(window.scrollY);
      const y = event.clientY;
      if (y >= top && y < top + size) {
        startDrag(event.pointerId, y);
      } else if (event.shiftKey) {
        // Shift-click: the thumb's middle jumps to the pointer, and the thumb stays in hand.
        const progress = travel > 0 ? clamp((y - INSET_PX - size / 2) / travel, 0, 1) : 0;
        window.scrollTo({ top: progress * max, behavior: 'instant' });
        startDrag(event.pointerId, y);
      } else {
        press = { pointer: event.pointerId, x: event.clientX, y, direction: y < top ? -1 : 1, timer: 0 };
        pageToward();
        press.timer = window.setTimeout(keepPaging, HOLD_DELAY_MS);
      }
      show();
    };
    const onMove = (event: PointerEvent) => {
      if (press && event.pointerId === press.pointer) {
        press.x = event.clientX;
        press.y = event.clientY;
        return;
      }
      if (!drag || event.pointerId !== drag.pointer) return;
      window.scrollTo({ top: drag.startScroll + (event.clientY - drag.startY) * drag.ratio, behavior: 'instant' });
    };
    const onUp = (event: PointerEvent) => {
      if (press && event.pointerId === press.pointer) {
        window.clearTimeout(press.timer);
        press = null;
      } else if (drag && event.pointerId === drag.pointer) {
        drag = null;
      } else return;
      release(event.pointerId);
      show();
    };

    refresh();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    bar.addEventListener('pointerenter', onEnter);
    bar.addEventListener('pointerleave', onLeave);
    bar.addEventListener('pointerdown', onDown);
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);
    bar.addEventListener('lostpointercapture', onUp);
    // The page grows and shrinks as content loads, reveals and closes: the thumb follows.
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(document.body);

    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      bar.removeEventListener('pointerenter', onEnter);
      bar.removeEventListener('pointerleave', onLeave);
      bar.removeEventListener('pointerdown', onDown);
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      bar.removeEventListener('pointercancel', onUp);
      bar.removeEventListener('lostpointercapture', onUp);
      sized?.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(edgeFrame);
      stopGlide();
      if (press) window.clearTimeout(press.timer);
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
