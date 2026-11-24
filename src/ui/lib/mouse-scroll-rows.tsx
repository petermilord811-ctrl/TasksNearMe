'use client';

import { useEffect } from 'react';

/**
 * Sideways rows for a mouse (owner, 2026-11-24: "in web browser mode, some button groups are not able to scroll
 * (without scrollbar)"). Chip rows, tabs and tool rows scroll sideways with their scrollbar hidden: a finger or a
 * trackpad moves them, a mouse couldn't. Mounted once for every page, this lets a mouse do it too, on any element that
 * scrolls sideways, has more to show, and shows no scrollbar of its own (one it draws can be dragged already):
 * - the wheel turns it when the wheel starts over it (a page scroll passing over a row goes on scrolling the page),
 *   until its end, and only where its own code doesn't take the wheel first (the landing map's card rail);
 * - a press and drag slides it, with the grab cursor (`cursor-grab active:cursor-grabbing`, which the bubble cursor
 *   reads too), and the click at the end of a drag doesn't press the chip it ended on.
 * Only a row the mouse is over listens to the wheel, so scrolling anywhere else never waits on this script.
 * `data-no-mouse-scroll` on an element turns this off inside it.
 */

/** How long after the last wheel event a new one belongs to the same gesture (ms). */
const GESTURE_GAP_MS = 350;
/** How far a press moves (px) before it's a drag, not a click. */
const DRAG_SLOP = 5;
/** Classes for the grab cursor while a row can be dragged (literal here, so Tailwind generates them). */
const GRAB_CLASSES = ['cursor-grab', 'active:cursor-grabbing'];

const SKIPPED = 'input, textarea, select, pre, code, table, [contenteditable=""], [contenteditable="true"]';

/** The nearest element from `start` up that scrolls sideways with a hidden scrollbar and has more to show, if any. */
export function sidewaysRowFrom(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof Element ? start : null;
  if (node?.closest('[data-no-mouse-scroll]')) return null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement && !node.matches(SKIPPED) && node.scrollWidth > node.clientWidth + 1) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        // A scrollbar that takes room can be dragged by itself: leave that row alone.
        const bar = node.offsetHeight - node.clientHeight - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0);
        return bar > 1 ? null : node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/** Whether `row` has room left to scroll toward `delta` (positive: on toward its end). */
function roomToward(row: HTMLElement, delta: number): boolean {
  return delta > 0 ? row.scrollLeft < row.scrollWidth - row.clientWidth - 1 : row.scrollLeft > 1;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A wheel's vertical turn in pixels. */
function wheelPixels(event: WheelEvent, row: HTMLElement): number {
  if (event.deltaMode === 1) return event.deltaY * 32;
  if (event.deltaMode === 2) return event.deltaY * row.clientWidth;
  return event.deltaY;
}

// One state and one set of handlers for the page: a row gets the same wheel listener however often it's found, and a
// remounted root (a language switch) doesn't add a second.
let lastWheelAt = -Infinity;
/** The row the current wheel gesture turns, if it turns one. */
let wheelRow: HTMLElement | null = null;
let turnedBy: WheelEvent | null = null;
const listening = new WeakSet<HTMLElement>();

/** Every wheel event on the page, after any row had its turn: when it was, and whether a row took it. */
function noteWheel(event: WheelEvent) {
  lastWheelAt = event.timeStamp;
  if (turnedBy !== event) wheelRow = null;
  turnedBy = null;
}

function onRowWheel(event: WheelEvent) {
  const row = event.currentTarget as HTMLElement;
  const continuing = event.timeStamp - lastWheelAt < GESTURE_GAP_MS;
  if (event.defaultPrevented || event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (sidewaysRowFrom(event.target) !== row) return;
  // A gesture that began on the page keeps scrolling the page as it passes over a row; one that turned this row to its
  // end goes on to the page.
  if ((continuing && wheelRow !== row) || !roomToward(row, event.deltaY)) return;
  event.preventDefault();
  wheelRow = row;
  turnedBy = event;
  const pixels = wheelPixels(event, row);
  // A mouse's notch glides; a trackpad's small steps follow the fingers.
  const notch = event.deltaMode !== 0 || Math.abs(pixels) >= 50;
  row.scrollBy({ left: pixels, behavior: notch && !reducedMotion() ? 'smooth' : 'instant' });
}

/** Gets `row` ready for a mouse: the grab cursor, and its wheel listener (only rows the mouse reaches listen). */
function prepareRow(row: HTMLElement) {
  if (!row.classList.contains(GRAB_CLASSES[0]!)) row.classList.add(...GRAB_CLASSES);
  if (listening.has(row)) return;
  listening.add(row);
  row.addEventListener('wheel', onRowWheel, { passive: false });
}

export function MouseScrollRows() {
  useEffect(() => {
    let press: { row: HTMLElement; id: number; x: number; left: number; dragging: boolean; snap: string; behavior: string } | null = null;
    let swallowClick = false;

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const row = sidewaysRowFrom(event.target);
      if (row) prepareRow(row);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.defaultPrevented) return;
      const row = sidewaysRowFrom(event.target);
      if (!row) return;
      prepareRow(row);
      press = { row, id: event.pointerId, x: event.clientX, left: row.scrollLeft, dragging: false, snap: row.style.scrollSnapType, behavior: row.style.scrollBehavior };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const moved = event.clientX - press.x;
      if (!press.dragging) {
        if (Math.abs(moved) < DRAG_SLOP) return;
        press.dragging = true;
        press.row.setAttribute('data-mouse-dragging', '');
        // Snapping would pull the row back to a card after every step of the drag; it snaps once it's let go.
        press.row.style.scrollSnapType = 'none';
        press.row.style.scrollBehavior = 'auto';
        window.getSelection()?.removeAllRanges();
      }
      press.row.scrollLeft = press.left - moved;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const { row, dragging, snap, behavior } = press;
      press = null;
      if (!dragging) return;
      row.removeAttribute('data-mouse-dragging');
      row.style.scrollBehavior = behavior;
      row.style.scrollSnapType = snap;
      // The click that ends a drag isn't a press of the chip under the pointer.
      swallowClick = true;
      window.setTimeout(() => {
        swallowClick = false;
      }, 0);
    };

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // A link or a photo in a row would start the browser's own drag and drop instead of sliding the row.
    const onDragStart = (event: DragEvent) => {
      if (press) event.preventDefault();
    };

    // Text selection would follow the drag otherwise.
    const onSelectStart = (event: Event) => {
      if (press?.dragging) event.preventDefault();
    };

    document.addEventListener('wheel', noteWheel, { passive: true });
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    window.addEventListener('click', onClick, { capture: true });
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('selectstart', onSelectStart);
    return () => {
      document.removeEventListener('wheel', noteWheel);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('selectstart', onSelectStart);
    };
  }, []);
  return null;
}
