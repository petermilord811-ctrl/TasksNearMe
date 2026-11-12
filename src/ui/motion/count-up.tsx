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

/**
 * Shows a supplied amount; when it changes (a picked example), the digits run from the old amount to the new
 * one. With `countUpOnReveal` it also counts up from zero the first time it scrolls into view. The last frame
 * is always the supplied value; the server, screen readers and reduced motion get the value at once.
 */
export function TweenMoney({ cents, durationMs = 560, countUpOnReveal = false, prefix = '', className }: { cents: number; durationMs?: number; countUpOnReveal?: boolean; prefix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(cents);
  const [revealed, setRevealed] = useState(!countUpOnReveal);
  const current = useRef(cents);

  // First time in view: start from zero, so the amount counts up.
  useEffect(() => {
    const element = ref.current;
    if (revealed || reduced || !element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        current.current = 0;
        setShown(0);
        setRevealed(true);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [revealed, reduced]);

  useEffect(() => {
    if (reduced || !revealed) return;
    const from = current.current;
    if (from === cents) return;
    const start = performance.now();
    const length = from === 0 ? Math.max(durationMs, 1100) : durationMs;
    let frame = requestAnimationFrame(function step(time: number) {
      const t = Math.min(1, (time - start) / length);
      current.current = t >= 1 ? cents : Math.round(from + (cents - from) * easeOut(t));
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [cents, durationMs, reduced, revealed]);

  const value = reduced || !revealed ? cents : shown;
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true" className="tabular-nums">{`${prefix}${formatMoney(value)}`}</span>
      <span className="sr-only">{`${prefix}${formatMoney(cents)}`}</span>
    </span>
  );
}
