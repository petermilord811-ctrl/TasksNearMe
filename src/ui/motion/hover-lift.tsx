'use client';

import { useCallback, useEffect, useRef, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';
import { usePrefersReducedMotion } from './use-reduced-motion';

interface Spring {
  value: number;
  velocity: number;
  target: number;
}

/** Stiffness and damping per spring (mass 1): calm, with the smallest overshoot. */
const HOVER = { stiffness: 210, damping: 24 };
const TILT = { stiffness: 160, damping: 22 };
const PRESS = { stiffness: 520, damping: 40 };

function advance(spring: Spring, { stiffness, damping }: { stiffness: number; damping: number }, dt: number) {
  const force = -stiffness * (spring.value - spring.target) - damping * spring.velocity;
  spring.velocity += force * dt;
  spring.value += spring.velocity * dt;
}

const settled = (spring: Spring) => Math.abs(spring.velocity) < 0.0005 && Math.abs(spring.value - spring.target) < 0.0005;

export interface HoverLiftProps {
  children: ReactNode;
  /** The outer box (layout: `h-full`, grid placement). It stays put, so the pointer never loses it. */
  className?: string;
  /** The surface that moves: its look (border, background, radius, padding). */
  surfaceClassName?: string;
  surfaceStyle?: CSSProperties;
  /** Largest tilt toward the pointer, in degrees (0: none). */
  tilt?: number;
  /** How far the surface rises, in px. */
  lift?: number;
  /** How much it grows (0.01 is 1%). */
  grow?: number;
  /** The light that follows the pointer, and the rim (any CSS color; `none` for no light). */
  glow?: string;
}

/**
 * A surface that answers the pointer like a physical card: it rises, tilts a little, and a soft light with a
 * brighter rim follows the cursor across it. One spring drives it all and is shared with what's inside through
 * `--hover` (0 to 1, on the outer box), so a shadow, an icon or an arrow inside moves with the card and turns
 * back smoothly halfway (`lift-*` classes in globals.css read it). `data-hovered` is set while pointed at or
 * focused, for looping touches. A press sinks it a little on any pointer, touch included (no hover on touch).
 * Keyboard focus lifts it like a hover. With reduced motion nothing moves; the light still shows.
 *
 * The outer box takes the pointer and never moves; only the surface inside it does, so a card that rises out
 * from under the cursor can't flicker between hovered and not.
 */
export function HoverLift({ children, className, surfaceClassName, surfaceStyle, tilt = 4, lift = 6, grow = 0.01, glow = 'var(--iri-3)' }: HoverLiftProps) {
  const reduced = usePrefersReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const springs = useRef({
    hover: { value: 0, velocity: 0, target: 0 },
    tiltX: { value: 0, velocity: 0, target: 0 },
    tiltY: { value: 0, velocity: 0, target: 0 },
    press: { value: 0, velocity: 0, target: 0 },
  });
  const pointerInside = useRef(false);
  const reducedRef = useRef(reduced);
  /** Starts the frame loop if it isn't running (set up in the effect below). */
  const kickRef = useRef<() => void>(() => {});

  const paint = useCallback(() => {
    const outer = outerRef.current;
    const surface = surfaceRef.current;
    if (!outer || !surface) return;
    const { hover, tiltX, tiltY, press } = springs.current;
    outer.style.setProperty('--hover', hover.value.toFixed(4));
    if (reducedRef.current) {
      surface.style.transform = '';
      return;
    }
    const scale = 1 + grow * hover.value - 0.022 * press.value;
    surface.style.transform = `perspective(1100px) translate3d(0, ${(-lift * hover.value).toFixed(2)}px, 0) rotateX(${tiltX.value.toFixed(3)}deg) rotateY(${tiltY.value.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
  }, [grow, lift]);

  useEffect(() => {
    reducedRef.current = reduced;
    paint();
  }, [reduced, paint]);

  // The frame loop: runs only while a spring is moving, then stops.
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const all = springs.current;
      // Small steps keep the stiffer press spring stable on slow frames.
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < steps; i += 1) {
        advance(all.hover, HOVER, dt / steps);
        advance(all.tiltX, TILT, dt / steps);
        advance(all.tiltY, TILT, dt / steps);
        advance(all.press, PRESS, dt / steps);
      }
      paint();
      if (settled(all.hover) && settled(all.tiltX) && settled(all.tiltY) && settled(all.press)) {
        frame = 0;
        last = 0;
        if (surfaceRef.current) surfaceRef.current.style.willChange = '';
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    kickRef.current = () => {
      if (reducedRef.current) {
        // No motion: jump to where the springs are going.
        for (const spring of Object.values(springs.current)) {
          spring.value = spring.target;
          spring.velocity = 0;
        }
        paint();
        return;
      }
      if (frame) return;
      if (surfaceRef.current) surfaceRef.current.style.willChange = 'transform';
      frame = requestAnimationFrame(tick);
    };
    return () => {
      cancelAnimationFrame(frame);
      kickRef.current = () => {};
    };
  }, [paint]);

  const kick = () => kickRef.current();
  const setHovered = (on: boolean) => {
    springs.current.hover.target = on ? 1 : 0;
    if (on) outerRef.current?.setAttribute('data-hovered', '');
    else outerRef.current?.removeAttribute('data-hovered');
  };

  const onPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    pointerInside.current = true;
    setHovered(true);
    kick();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const outer = outerRef.current;
    if (!outer) return;
    // The outer box never moves, so this is a steady frame of reference.
    const box = outer.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    outer.style.setProperty('--hx', `${x.toFixed(1)}px`);
    outer.style.setProperty('--hy', `${y.toFixed(1)}px`);
    const px = Math.min(1, Math.max(0, x / Math.max(1, box.width)));
    const py = Math.min(1, Math.max(0, y / Math.max(1, box.height)));
    // The part under the pointer gives way a little, like pressing on a card lying on a table.
    springs.current.tiltX.target = (0.5 - py) * tilt;
    springs.current.tiltY.target = (px - 0.5) * tilt;
    kick();
  };
  const onPointerLeave = () => {
    pointerInside.current = false;
    const all = springs.current;
    if (!outerRef.current?.matches(':focus-within')) setHovered(false);
    all.tiltX.target = 0;
    all.tiltY.target = 0;
    all.press.target = 0;
    kick();
  };
  const onPointerDown = () => {
    springs.current.press.target = 1;
    kick();
  };
  const onPointerUp = () => {
    springs.current.press.target = 0;
    kick();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return;
    const outer = outerRef.current;
    if (outer) {
      // Light from the middle when the keyboard brings it up.
      outer.style.setProperty('--hx', `${(outer.clientWidth / 2).toFixed(1)}px`);
      outer.style.setProperty('--hy', `${(outer.clientHeight / 2).toFixed(1)}px`);
    }
    setHovered(true);
    kick();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && outerRef.current?.contains(event.relatedTarget)) return;
    if (!pointerInside.current) setHovered(false);
    kick();
  };

  return (
    <div
      ref={outerRef}
      className={cn('group/lift relative', className)}
      style={{ ['--lift-glow' as string]: glow }}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div ref={surfaceRef} className={cn('lift-surface relative isolate h-full', surfaceClassName)} style={surfaceStyle}>
        {glow !== 'none' && (
          <>
            <span aria-hidden="true" className="lift-light pointer-events-none absolute inset-0 -z-[1] rounded-[inherit]" />
            <span aria-hidden="true" className="lift-rim pointer-events-none absolute -inset-px -z-[1] rounded-[inherit]" />
          </>
        )}
        {children}
      </div>
    </div>
  );
}
