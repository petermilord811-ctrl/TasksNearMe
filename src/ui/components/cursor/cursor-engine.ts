import { readPointerPreference, subscribePointerPreference } from './pointer-preference';
import { pageSwitchOf, pressStateOf, sectionOf, zoneOf, type CursorHint } from './cursor-targets';

/**
 * The Bubble cursor's behavior (2026-11-24; the design is in docs/automation/decisions.md): it follows a mouse exactly
 * and moves at four moments only (a press, entering another part of the page, a page switch, a link that says what it
 * does). Plain DOM, no React: BubbleCursor mounts it once for the whole app.
 *
 * It shows only on devices with a mouse, without forced colors, unless the person chose the system pointer; the
 * system pointer is hidden (html[data-pointer="bubble"], bubble-cursor.css) only after the first mouse move has put the
 * bubble in place. Any error removes it and gives the system pointer back.
 */

/** The tip (the hotspot) sits at (2.5, 2.5) of the 24-unit drawing shown at 26 px. */
const HOT = (2.5 * 26) / 24;
/** A page switch shows the spinner only if the page isn't there by then, so a fast one shows nothing. */
export const SPINNER_DELAY_MS = 120;
/** A switch that never arrives (a refused link, a dropped network) stops showing after this long. */
const SWITCH_LIMIT_MS = 10_000;
/** At most one "into a new section" this often, so a quick zigzag across a border stays calm. */
const SECTION_GAP_MS = 500;
/** The words beside the bubble wait this long on a link. */
const LABEL_DELAY_MS = 600;
const PRESS_UP_MS = 300;
const CROSS_MS = 440;
const ARRIVE_MS = 620;

export interface CursorLabels {
  sheet: string;
  tab: string;
  off: string;
}

export function startCursor(node: HTMLElement, labels: CursorLabels): () => void {
  const root = document.documentElement;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const forced = window.matchMedia('(forced-colors: active)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const label = node.querySelector<HTMLElement>('[data-bcur-label]');
  let enabled = false;
  let broken = false;
  let lastTarget: Element | null = null;
  let section: Element | null = null;
  let scrolled = false;
  let lastCross = -Infinity;
  let flip = false;
  let hint: CursorHint | null = null;
  let switching: string | null = null;
  let labelTimer = 0;
  let pressTimer = 0;
  let crossTimer = 0;
  let arriveTimer = 0;
  let spinnerTimer = 0;
  let limitTimer = 0;
  let poll = 0;
  const trail: { x: number; y: number; t: number }[] = [];

  const set = (name: string, value: string | null) => {
    if (value === null) {
      if (name in node.dataset) delete node.dataset[name];
    } else if (node.dataset[name] !== value) node.dataset[name] = value;
  };
  const still = () => reduce.matches || root.getAttribute('data-motion') === 'off';
  const here = () => window.location.pathname + window.location.search;

  function release() {
    node.hidden = true;
    root.removeAttribute('data-pointer');
    lastTarget = null;
    section = null;
  }

  function refresh() {
    const want = !broken && fine.matches && !forced.matches && readPointerPreference() === 'bubble';
    if (want === enabled) return;
    enabled = want;
    if (!enabled) {
      cancelSwitch();
      set('load', null);
      release();
    }
  }

  function say(next: CursorHint | null) {
    if (next === hint) return;
    hint = next;
    window.clearTimeout(labelTimer);
    set('label', null);
    set('say', next);
    if (next && label) {
      label.textContent = labels[next];
      labelTimer = window.setTimeout(() => {
        if (hint === next) set('label', '1');
      }, LABEL_DELAY_MS);
    }
  }

  function cross() {
    const first = trail[0];
    const last = trail[trail.length - 1];
    const deg = first && last && (first.x !== last.x || first.y !== last.y) ? (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI : 90;
    node.style.setProperty('--bcur-dir', `${Math.round(deg)}deg`);
    flip = !flip;
    set('cross', flip ? 'a' : 'b');
    window.clearTimeout(crossTimer);
    crossTimer = window.setTimeout(() => set('cross', null), CROSS_MS);
  }

  /** Reads what's under the pointer: only when the element under it changes. */
  function look(target: Element | null) {
    const zone = zoneOf(target);
    set('away', zone === 'bubble' ? null : '1');
    const state = zone === 'bubble' ? pressStateOf(target) : { hover: null, hint: null };
    set('hover', state.hover);
    say(switching ? null : state.hint);
    const next = sectionOf(target);
    if (next !== section) {
      const now = performance.now();
      if (section && next && !scrolled && !switching && node.dataset.press !== 'down' && zone === 'bubble' && now - lastCross > SECTION_GAP_MS && !still()) {
        lastCross = now;
        cross();
      }
      section = next;
    }
    scrolled = false;
  }

  function cancelSwitch() {
    switching = null;
    window.clearTimeout(spinnerTimer);
    window.clearTimeout(limitTimer);
    window.cancelAnimationFrame(poll);
  }

  function endSwitch(arrived: boolean) {
    const shown = node.dataset.load === 'loading';
    cancelSwitch();
    window.clearTimeout(arriveTimer);
    if (shown && arrived) {
      set('load', 'arrive');
      arriveTimer = window.setTimeout(() => set('load', null), ARRIVE_MS);
    } else set('load', null);
    // The new page is under the pointer: read it on the next move.
    lastTarget = null;
  }

  function beginSwitch() {
    cancelSwitch();
    const from = here();
    switching = from;
    say(null);
    spinnerTimer = window.setTimeout(() => {
      if (switching === null) return;
      window.clearTimeout(arriveTimer);
      set('press', null);
      set('cross', null);
      set('load', 'loading');
    }, SPINNER_DELAY_MS);
    limitTimer = window.setTimeout(() => endSwitch(false), SWITCH_LIMIT_MS);
    const check = () => {
      if (switching === null) return;
      if (here() !== switching) endSwitch(true);
      else poll = window.requestAnimationFrame(check);
    };
    poll = window.requestAnimationFrame(check);
  }

  const guard = <E extends Event>(handler: (event: E) => void) => (event: E) => {
    try {
      handler(event);
    } catch {
      broken = true;
      enabled = false;
      cancelSwitch();
      release();
    }
  };

  const onMove = guard((event: PointerEvent) => {
    if (!enabled) return;
    if (event.pointerType !== 'mouse') {
      set('away', '1');
      lastTarget = null;
      return;
    }
    const x = event.clientX;
    const y = event.clientY;
    node.style.transform = `translate3d(${x - HOT}px, ${y - HOT}px, 0)`;
    trail.push({ x, y, t: event.timeStamp });
    while (trail.length > 1 && (trail.length > 8 || event.timeStamp - trail[0]!.t > 120)) trail.shift();
    if (node.hidden) node.hidden = false;
    // Only after the bubble is in place does the system pointer go (and again after a re-render dropped the mark).
    if (root.getAttribute('data-pointer') !== 'bubble') root.setAttribute('data-pointer', 'bubble');
    const target = event.target instanceof Element ? event.target : null;
    if (target !== lastTarget) {
      lastTarget = target;
      look(target);
    }
  });
  const onDown = guard((event: PointerEvent) => {
    if (!enabled || event.pointerType !== 'mouse' || event.button !== 0 || switching !== null || node.dataset.away) return;
    window.clearTimeout(pressTimer);
    set('cross', null);
    set('press', 'down');
  });
  const onUp = guard(() => {
    if (node.dataset.press !== 'down') return;
    set('press', 'up');
    pressTimer = window.setTimeout(() => set('press', null), PRESS_UP_MS);
  });
  const onClick = guard((event: MouseEvent) => {
    if (!enabled) return;
    if (pageSwitchOf(event, window.location)) beginSwitch();
  });
  const onOut = guard((event: PointerEvent) => {
    // Left the window, or went into a frame (a checkout, the bot check): the frame shows the system pointer.
    if (event.relatedTarget === null) {
      set('away', '1');
      lastTarget = null;
    }
  });
  const onLeave = guard(() => {
    set('away', '1');
    lastTarget = null;
  });
  const onScroll = () => {
    scrolled = true;
  };
  const onPopState = guard(() => {
    if (switching !== null) endSwitch(true);
  });

  refresh();
  const unsubscribe = subscribePointerPreference(refresh);
  for (const query of [fine, forced]) query.addEventListener('change', refresh);
  document.addEventListener('pointermove', onMove, { capture: true, passive: true });
  document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  window.addEventListener('pointerup', onUp, { capture: true, passive: true });
  window.addEventListener('pointercancel', onUp, { capture: true, passive: true });
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('pointerout', onOut, { capture: true, passive: true });
  window.addEventListener('blur', onLeave);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('popstate', onPopState);

  return () => {
    unsubscribe();
    for (const query of [fine, forced]) query.removeEventListener('change', refresh);
    document.removeEventListener('pointermove', onMove, { capture: true });
    document.removeEventListener('pointerdown', onDown, { capture: true });
    window.removeEventListener('pointerup', onUp, { capture: true });
    window.removeEventListener('pointercancel', onUp, { capture: true });
    document.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('pointerout', onOut, { capture: true });
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('popstate', onPopState);
    for (const timer of [labelTimer, pressTimer, crossTimer, arriveTimer]) window.clearTimeout(timer);
    cancelSwitch();
    release();
  };
}
