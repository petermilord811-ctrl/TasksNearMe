'use client';

import { useRef, type ReactNode } from 'react';
import { useChapterFrame } from './chapter-stage';

/**
 * The hero's words on the stage: the first thing to leave when the map is on its way (they lift and fade before the
 * window opens), and the last to come back. Off the stage they simply stay.
 */
export function HeroWords({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useChapterFrame((_, moment) => {
    const element = ref.current;
    if (!element) return;
    const out = moment.wordsOut;
    element.style.transform = out > 0 ? `translate3d(0, ${(-out * 1.6).toFixed(3)}em, 0)` : '';
    element.style.opacity = out > 0 ? String(1 - out) : '';
    element.style.visibility = out >= 1 ? 'hidden' : '';
    element.style.pointerEvents = out > 0 ? 'none' : '';
  });
  return (
    <div ref={ref} data-hero-words="" className={className}>
      {children}
    </div>
  );
}
