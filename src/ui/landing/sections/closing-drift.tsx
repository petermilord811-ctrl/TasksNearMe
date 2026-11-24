'use client';

import { useEffect, useRef } from 'react';

/**
 * The closing card's slowly drifting colors. The drift moves the gradient's position, which the page has to paint
 * again on every frame, so it runs only while the card is on screen: elsewhere it's paused where it was (2026-11-24,
 * round three; it used to run all the time, keeping the page drawing frames even at the top).
 */
export function ClosingDrift({ image }: { image: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') return;
    const watch = new IntersectionObserver(([entry]) => {
      if (entry) element.toggleAttribute('data-drifting', entry.isIntersecting);
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      // Without the observer (very old browsers) it simply drifts.
      data-drifting=""
      className="absolute inset-0 -z-10 [animation:hue-drift_14s_ease-in-out_infinite] [&:not([data-drifting])]:[animation-play-state:paused]"
      style={{ backgroundImage: image, backgroundSize: '220% 220%' }}
    />
  );
}
