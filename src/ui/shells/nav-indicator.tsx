'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * A pill behind the current page's link that glides to the next one as the page changes (it follows
 * `aria-current`). It goes first in a `relative` box that holds the list. Until it has measured (no JavaScript
 * yet, or still hydrating) the current link draws its own pill, so nothing jumps; once the pill is in place it
 * marks the box `data-indicator` and the link's own pill steps aside. Size changes move it without gliding.
 */
export function NavIndicator({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const pill = ref.current;
    const box = pill?.parentElement;
    if (!pill || !box) return;
    let placed = false;
    const place = (glide: boolean) => {
      // The dock's raised Home circle shows its own current state: no pill behind it.
      const current = box.querySelector<HTMLElement>('[aria-current="page"]:not([data-nav-circle])');
      if (!current) {
        pill.style.opacity = '0';
        box.removeAttribute('data-indicator');
        placed = false;
        return;
      }
      const outer = box.getBoundingClientRect();
      const inner = current.getBoundingClientRect();
      const animate = glide && placed;
      if (!animate) pill.style.transition = 'none';
      pill.style.width = `${inner.width}px`;
      pill.style.height = `${inner.height}px`;
      pill.style.transform = `translate3d(${inner.left - outer.left}px, ${inner.top - outer.top}px, 0)`;
      pill.style.opacity = '1';
      if (!animate) {
        // Apply the jump before transitions come back.
        void pill.offsetWidth;
        pill.style.removeProperty('transition');
      }
      box.setAttribute('data-indicator', '');
      placed = true;
    };
    place(false);
    const changes = new MutationObserver(() => place(true));
    changes.observe(box, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(false));
    sized?.observe(box);
    return () => {
      changes.disconnect();
      sized?.disconnect();
      box.removeAttribute('data-indicator');
    };
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none absolute top-0 left-0 opacity-0 transition-[transform,width,height,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform', className)}
    />
  );
}
