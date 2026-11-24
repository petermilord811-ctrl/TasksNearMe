import { subscribePointerPreference } from './pointer-preference';
import { cursorValue, kindOfCursor, type CursorKind, type CursorPose } from './cursor-art';
import { pageSwitchOf, sectionOf } from './cursor-targets';

/**
 * The Bubble cursor's moving moments (2026-11-24, round two). The cursor itself is a real cursor image set by CSS
 * (bubble-cursor.generated.css): the system draws it, so it never lags and nothing runs while the mouse moves. This
 * only plays the few moments that move, as short runs of frames on the element under the pointer:
 * - a press squeezes it, and the release springs back (a disabled control shakes "no");
 * - entering another part of the page by your own movement swings it from its tip, away from the way you're going,
 *   and lets it settle (moving up or down, it squashes and settles instead) — motion, no change of color;
 * - a link that says what it does (new tab, opens here) pops its sign in, and after a moment the words show beside it;
 * - a page switch that isn't there after 120 ms turns it into a rounded square with a spinner; on arrival the ring
 *   closes into a check and it rounds again.
 * It listens only to the pointer entering elements, presses and clicks: never to plain movement. Browsers redraw a
 * cursor that changes without movement about every 50 ms, so frames are 60 ms apart.
 */

export const FRAME_MS = 60;
export const SPINNER_DELAY_MS = 120;
const LOADING_FRAME_MS = 90;
const SWITCH_LIMIT_MS = 10_000;
const SECTION_GAP_MS = 500;
const LABEL_DELAY_MS = 600;

export interface CursorLabels {
  sheet: string;
  tab: string;
  off: string;
}

type Painted = Element & ElementCSSInlineStyle;

/** Kinds that press and swing: the bubble shapes (text, drag and map cursors stay still). */
const BUBBLES = new Set<CursorKind>(['rest', 'press', 'tab', 'sheet', 'off', 'busy']);
const POP: CursorPose[] = [{ scale: 0.88 }, { scale: 1.09 }];
const RELEASE: CursorPose[] = [{ scale: 1.08 }, { scale: 1.02 }];
const SHAKE: CursorPose[] = [{ rotate: 11 }, { rotate: -9 }, { rotate: 5 }, { rotate: -2 }];
const ARRIVE: CursorPose[] = [{ check: 0.2 }, { check: 0.6 }, { check: 1 }, { check: 1 }, { check: 1, corner: 7, scale: 0.96 }];

/** Entering a new part of the page: the body, hanging from the tip, lags behind the movement and settles. */
export function swingPoses(dx: number, dy: number): CursorPose[] {
  if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
    // Sideways: moving right swings the body left (clockwise about the tip), then back, smaller each time.
    const a = 16 * (dx >= 0 ? 1 : -1);
    return [{ rotate: a, sx: 0.96, sy: 1.04 }, { rotate: -a * 0.55 }, { rotate: a * 0.25 }, { rotate: -a * 0.08 }];
  }
  // Up or down: it squashes against the way in and stretches back.
  return dy >= 0
    ? [{ sx: 1.1, sy: 0.86 }, { sx: 0.95, sy: 1.07 }, { sx: 1.02, sy: 0.98 }]
    : [{ sx: 0.92, sy: 1.1 }, { sx: 1.05, sy: 0.96 }, { sx: 0.99, sy: 1.01 }];
}

export function startCursorMotion(labels: CursorLabels): () => void {
  const root = document.documentElement;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const forced = window.matchMedia('(forced-colors: active)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const on = () => !broken && fine.matches && !forced.matches && root.getAttribute('data-pointer') !== 'system';
  const calm = () => reduce.matches || root.getAttribute('data-motion') === 'off';
  const frames = new Map<string, string>();
  const frame = (kind: CursorKind, pose: CursorPose = {}) => {
    const key = `${kind}${JSON.stringify(pose)}`;
    let value = frames.get(key);
    if (!value) {
      value = cursorValue(kind, pose);
      frames.set(key, value);
    }
    return value;
  };
  const kindAt = (el: Element) => kindOfCursor(window.getComputedStyle(el).cursor);

  let broken = false;
  let lastX = 0;
  let lastY = 0;
  let over: Element | null = null;
  let section: Element | null = null;
  let scrolled = false;
  let lastSwing = -Infinity;
  let lastKind: CursorKind | null = null;
  let pressed: { el: Element; kind: CursorKind } | null = null;

  // ---- Painting a frame on one element (inline, so it wins over every rule), and putting it back ----------------------
  let painted: { el: Painted; value: string; priority: string } | null = null;
  function paint(el: Element, value: string) {
    if (!('style' in el)) return;
    const target = el as Painted;
    if (painted && painted.el !== target) unpaint();
    if (!painted) painted = { el: target, value: target.style.getPropertyValue('cursor'), priority: target.style.getPropertyPriority('cursor') };
    target.style.setProperty('cursor', value, 'important');
  }
  function unpaint() {
    if (!painted) return;
    const { el, value, priority } = painted;
    painted = null;
    if (value) el.style.setProperty('cursor', value, priority);
    else el.style.removeProperty('cursor');
  }

  // ---- A short run of frames; it follows the pointer onto an element showing the same kind ----------------------------
  let sequence: { el: Element; kind: CursorKind; value: string } | null = null;
  let timer = 0;
  function stop() {
    window.clearTimeout(timer);
    sequence = null;
    unpaint();
  }
  function play(el: Element, kind: CursorKind, poses: readonly CursorPose[]) {
    window.clearTimeout(timer);
    let index = 0;
    sequence = { el, kind, value: '' };
    const step = () => {
      if (!sequence) return;
      const pose = poses[index];
      if (!pose) {
        stop();
        return;
      }
      sequence.value = frame(kind, pose);
      paint(sequence.el, sequence.value);
      index += 1;
      timer = window.setTimeout(step, FRAME_MS);
    };
    step();
  }

  // ---- The words beside a link that says what it does ----------------------------------------------------------------
  let labelEl: HTMLElement | null = null;
  let labelKind: CursorKind | null = null;
  let labelTimer = 0;
  let labelFrame = 0;
  const placeLabel = () => {
    labelFrame = 0;
    if (labelEl) labelEl.style.transform = `translate3d(${lastX + 22}px, ${lastY + 18}px, 0)`;
  };
  const followLabel = (event: PointerEvent) => {
    lastX = event.clientX;
    lastY = event.clientY;
    if (!labelFrame) labelFrame = window.requestAnimationFrame(placeLabel);
  };
  function hideLabel() {
    window.clearTimeout(labelTimer);
    if (labelEl) delete labelEl.dataset.shown;
    document.removeEventListener('pointermove', followLabel, { capture: true });
  }
  function sayFor(kind: CursorKind | null) {
    const say = kind === 'tab' || kind === 'sheet' || kind === 'off' ? kind : null;
    if (say === labelKind) return;
    labelKind = say;
    hideLabel();
    if (!say) return;
    labelTimer = window.setTimeout(() => {
      if (!labelEl) {
        labelEl = document.createElement('div');
        labelEl.className = 'bcur-label';
        labelEl.setAttribute('aria-hidden', 'true');
        document.body.append(labelEl);
      }
      labelEl.textContent = labels[say];
      placeLabel();
      labelEl.dataset.shown = '';
      document.addEventListener('pointermove', followLabel, { capture: true, passive: true });
    }, LABEL_DELAY_MS);
  }

  // ---- Page switches --------------------------------------------------------------------------------------------------
  let switching: string | null = null;
  let loading = false;
  let spin = 0;
  let switchTimer = 0;
  let limitTimer = 0;
  let pollTimer = 0;
  let loadTimer = 0;
  const here = () => window.location.pathname + window.location.search;
  /** The element the pointer is over now (the page under it may have changed without any movement). */
  const hovered = () => {
    const list = document.querySelectorAll(':hover');
    return list.length > 0 ? list[list.length - 1]! : over;
  };
  function paintLoading() {
    const el = hovered();
    if (el) paint(el, calm() ? frame('busy') : frame('loading', { spin: (spin % 8) * 45 }));
  }
  function tick() {
    if (!loading) return;
    paintLoading();
    spin += 1;
    loadTimer = window.setTimeout(tick, LOADING_FRAME_MS);
  }
  function endSwitch(arrived: boolean) {
    const wasLoading = loading;
    switching = null;
    loading = false;
    for (const id of [switchTimer, limitTimer, pollTimer, loadTimer]) window.clearTimeout(id);
    if (!wasLoading) return;
    const el = hovered();
    if (arrived && el && !calm()) play(el, 'loading', ARRIVE);
    else stop();
  }
  function beginSwitch() {
    endSwitch(false);
    const from = here();
    switching = from;
    switchTimer = window.setTimeout(() => {
      if (switching === null) return;
      stop();
      pressed = null;
      labelKind = null;
      hideLabel();
      loading = true;
      spin = 0;
      tick();
    }, SPINNER_DELAY_MS);
    limitTimer = window.setTimeout(() => endSwitch(false), SWITCH_LIMIT_MS);
    const check = () => {
      if (switching === null) return;
      if (here() !== from) endSwitch(true);
      else pollTimer = window.setTimeout(check, 50);
    };
    pollTimer = window.setTimeout(check, 50);
  }

  // ---- Events ---------------------------------------------------------------------------------------------------------
  const guard = <E extends Event>(handler: (event: E) => void) => (event: E) => {
    try {
      handler(event);
    } catch {
      // The cursors themselves are CSS and stay; only the moving moments stop.
      broken = true;
      stop();
      hideLabel();
    }
  };

  const onOver = guard((event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    over = el;
    if (!on()) {
      stop();
      hideLabel();
      return;
    }
    if (loading) {
      paintLoading();
      return;
    }
    const next = sectionOf(el);
    const crossed = section !== null && next !== null && next !== section && !scrolled;
    section = next;
    scrolled = false;
    if (pressed) return;
    if (sequence && sequence.el !== el) {
      // Onto an element showing the same cursor: the moment carries on there; anything else shows its own at once.
      if (kindAt(el) === sequence.kind) {
        sequence.el = el;
        paint(el, sequence.value);
      } else stop();
    }
    const kind = sequence?.el === el ? sequence.kind : kindAt(el);
    sayFor(kind);
    if (!kind || !BUBBLES.has(kind) || calm()) {
      lastKind = kind;
      return;
    }
    const now = performance.now();
    if (crossed && now - lastSwing > SECTION_GAP_MS) {
      lastSwing = now;
      play(el, kind, swingPoses(dx, dy));
    } else if ((kind === 'tab' || kind === 'sheet') && kind !== lastKind && !sequence) play(el, kind, POP);
    lastKind = kind;
  });

  const onDown = guard((event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !on() || loading) return;
    const el = event.target instanceof Element ? event.target : null;
    if (!el) return;
    const kind = kindAt(el);
    if (!kind || !BUBBLES.has(kind)) return;
    window.clearTimeout(timer);
    sequence = null;
    if (calm()) return;
    if (kind === 'off') {
      play(el, kind, SHAKE);
      return;
    }
    pressed = { el, kind };
    paint(el, frame(kind, { scale: 0.84 }));
  });
  const onUp = guard(() => {
    if (!pressed) return;
    const { el, kind } = pressed;
    pressed = null;
    if (loading) return;
    play(el, kind, RELEASE);
  });
  const onClick = guard((event: MouseEvent) => {
    if (on() && pageSwitchOf(event, window.location)) beginSwitch();
  });
  const onScroll = () => {
    scrolled = true;
  };
  const onPopState = guard(() => {
    if (switching !== null) endSwitch(true);
  });
  const onLeave = guard((event: PointerEvent) => {
    if (event.relatedTarget === null) {
      labelKind = null;
      hideLabel();
    }
  });

  const unsubscribe = subscribePointerPreference(() => {
    stop();
    hideLabel();
  });
  document.addEventListener('pointerover', onOver, { capture: true, passive: true });
  document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  window.addEventListener('pointerup', onUp, { capture: true, passive: true });
  window.addEventListener('pointercancel', onUp, { capture: true, passive: true });
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('pointerout', onLeave, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('popstate', onPopState);

  return () => {
    unsubscribe();
    document.removeEventListener('pointerover', onOver, { capture: true });
    document.removeEventListener('pointerdown', onDown, { capture: true });
    window.removeEventListener('pointerup', onUp, { capture: true });
    window.removeEventListener('pointercancel', onUp, { capture: true });
    document.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('pointerout', onLeave, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('popstate', onPopState);
    for (const id of [switchTimer, limitTimer, pollTimer, loadTimer]) window.clearTimeout(id);
    window.cancelAnimationFrame(labelFrame);
    stop();
    hideLabel();
    labelEl?.remove();
  };
}
