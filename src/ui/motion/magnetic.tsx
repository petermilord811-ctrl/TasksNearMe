'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';
import { useFinePointer, usePrefersReducedMotion } from './use-reduced-motion';

/**
 * Pulls its child gently toward the cursor while the cursor is near (a "magnetic" button), and springs
 * back when it leaves. Mouse and trackpad only; nothing under reduced motion. Work happens in
 * requestAnimationFrame, never in the pointer handler itself.
 */
export function Magnetic({ children, strength = 0.22, radius = 90, className }: { children: ReactNode; strength?: number; radius?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();

  useEffect(() => {
    const element = ref.current;
    if (!element || reduced || !fine) return;
    let frame = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const tick = () => {
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      element.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
      if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) frame = requestAnimationFrame(tick);
      else frame = 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const near = Math.hypot(dx, dy) < radius + Math.max(box.width, box.height) / 2;
      target = near ? { x: dx * strength, y: dy * strength } : { x: 0, y: 0 };
      kick();
    };
    const onLeave = () => {
      target = { x: 0, y: 0 };
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
      element.style.transform = '';
    };
  }, [reduced, fine, strength, radius]);

  return (
    <span ref={ref} className={cn('inline-flex will-change-transform', className)}>
      {children}
    </span>
  );
}
