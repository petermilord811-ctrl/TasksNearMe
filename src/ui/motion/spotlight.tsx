'use client';

import { useCallback, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * A surface with a soft light that follows the cursor across it (`--mx`/`--my` drive a radial gradient
 * overlay). Purely decorative: no layout, no work when the cursor is elsewhere, nothing on touch.
 */
export function Spotlight({ children, className, glow = 'var(--iri-3)', ...rest }: { children: ReactNode; className?: string; glow?: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const element = ref.current;
    if (!element) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = element.getBoundingClientRect();
      element.style.setProperty('--mx', `${clientX - box.left}px`);
      element.style.setProperty('--my', `${clientY - box.top}px`);
    });
  }, []);
  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn('group/spot relative isolate overflow-hidden', className)}
      style={{ ['--spot' as string]: glow }}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100 motion-reduce:hidden"
        style={{ background: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklab, var(--spot) 18%, transparent), transparent 70%)' }}
      />
      {children}
    </div>
  );
}
