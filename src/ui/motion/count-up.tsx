'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/shared/format';
import { easeOut } from './tokens';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * Shows a supplied amount. When it first scrolls into view it counts up to that exact amount (display
 * only: the final frame is the supplied value, formatted by `formatMoney`). Screen readers, the server,
 * and reduced motion get the final value at once.
 */
export function CountUpMoney({ cents, durationMs = 1100, className }: { cents: number; durationMs?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<number | null>(null);
  const final = formatMoney(cents);

  useEffect(() => {
    const element = ref.current;
    if (!element || reduced || !('IntersectionObserver' in window)) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (time: number) => {
          const t = Math.min(1, (time - start) / durationMs);
          setShown(t >= 1 ? null : Math.round(cents * easeOut(t)));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [cents, durationMs, reduced]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true" className="tabular-nums">{shown === null ? final : formatMoney(shown)}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
